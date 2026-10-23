import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '../../shared/utils/phone'
import { INDONESIAN_TIMEZONES } from '../../shared/utils/auth'
import { watermarkSchema } from '../../shared/media/edit-spec'
import { recordAudit } from './audit'
import { assertAbility, type StaffContext, type WorkspaceContext } from './context'
import {
  bioItems, bioPages, contentIdeaLinks, contentIdeaMedia, contentIdeas, dmEvents, dmRules, hashtagSets, links, mediaAssets, notifications, payments, posts, postTargets,
  shortLinks, socialAccounts, staffUsers, subscriptions, users, workspaceMembers, workspaces
} from './db/schema'
import { appError } from './errors'
import { notifyStaff } from './notifications'
import { getSettingNumber } from './settings'
import { storage } from './services/storage'

const phoneField = z.string().trim().max(20).refine(value => !value || isValidIndonesianPhone(value), 'Nomor HP tidak valid.').optional()

export const creatorProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100, 'Nama terlalu panjang.').optional(),
  phone: phoneField,
  image: z.url('Tautan gambar tidak valid.').nullable().optional(),
  locale: z.enum(['id', 'en']).optional()
})

/** PATCH /api/app/me — any member edits their own login. */
export async function updateCreatorProfile(ctx: WorkspaceContext, input: z.infer<typeof creatorProfileSchema>) {
  if (!ctx.userId) throw appError(403, 'Tidak tersedia.', 'FORBIDDEN')
  const phone = input.phone === undefined ? undefined : normalizeIndonesianPhone(input.phone)
  if (phone) {
    const [taken] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, ctx.userId))).limit(1)
    if (taken) throw appError(409, 'Nomor HP sudah dipakai akun lain.', 'CONFLICT', { field: 'phone' })
  }
  const [row] = await ctx.db.update(users).set({
    ...(input.name !== undefined && { name: input.name }),
    ...(input.phone !== undefined && { phone }),
    ...(input.image !== undefined && { image: input.image }),
    ...(input.locale !== undefined && { locale: input.locale }),
    updatedAt: new Date()
  }).where(eq(users.id, ctx.userId)).returning({ id: users.id, name: users.name, phone: users.phone, image: users.image, locale: users.locale })
  return row
}

export const staffProfileSchema = creatorProfileSchema.omit({ locale: true })

export async function updateStaffProfile(ctx: StaffContext, input: z.infer<typeof staffProfileSchema>) {
  const phone = input.phone === undefined ? undefined : normalizeIndonesianPhone(input.phone)
  const [row] = await ctx.db.update(staffUsers).set({
    ...(input.name !== undefined && { name: input.name }),
    ...(input.phone !== undefined && { phone }),
    ...(input.image !== undefined && { image: input.image }),
    updatedAt: new Date()
  }).where(eq(staffUsers.id, ctx.staffUserId)).returning({ id: staffUsers.id, name: staffUsers.name, phone: staffUsers.phone, image: staffUsers.image })
  return row
}

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100, 'Nama terlalu panjang.').optional(),
  timezone: z.enum(INDONESIAN_TIMEZONES).optional(),
  niche: z.string().trim().max(60).nullable().optional(),
  affiliatePrograms: z.array(z.enum(['shopee', 'tiktok_shop', 'tokopedia', 'lazada', 'other'])).max(5).optional(),
  watermark: watermarkSchema.nullable().optional()
})

/** PATCH /api/app/settings (docs/blueprint/05 §6). Paid options are gated only when chosen (none yet). */
export async function updateWorkspaceSettings(ctx: WorkspaceContext, input: z.infer<typeof workspaceSettingsSchema>) {
  assertAbility(ctx, 'settings.manage')
  // The editor draws the logo on a canvas, so it must come from our own media storage (POST /api/app/uploads).
  if (input.watermark && !input.watermark.url.startsWith(storage().publicUrl(`w/${ctx.workspaceId}/`))) {
    throw appError(422, 'Unggah logo lewat tombol "Unggah logo".', 'VALIDATION_FAILED', { field: 'watermark' })
  }
  const [row] = await ctx.db.update(workspaces).set({ ...input, updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspaceId))
    .returning({ id: workspaces.id, name: workspaces.name, timezone: workspaces.timezone, niche: workspaces.niche, affiliatePrograms: workspaces.affiliatePrograms, watermark: workspaces.watermark })
  await recordAudit(ctx, { audience: 'creator', action: 'settings.update', workspaceId: ctx.workspaceId, metadata: { userId: ctx.userId, fields: Object.keys(input) } })
  return row
}

/** The onboarding checklist is non-blocking; "Sembunyikan panduan" just marks it done (docs/blueprint/05 §3). */
export async function dismissOnboarding(ctx: WorkspaceContext) {
  assertAbility(ctx, 'settings.manage')
  await ctx.db.update(workspaces).set({ onboardingCompletedAt: new Date() }).where(eq(workspaces.id, ctx.workspaceId))
  return { success: true }
}

/** GET /api/app/account/export — everything the workspace owns, never tokens or IP hashes (docs/blueprint/05 §8). */
export async function exportWorkspaceData(ctx: WorkspaceContext) {
  assertAbility(ctx, 'account.manage')
  const w = ctx.workspaceId
  const [workspace] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, w))
  const members = await ctx.db.select({ role: workspaceMembers.role, isActive: workspaceMembers.isActive, name: users.name, email: users.email, createdAt: workspaceMembers.createdAt })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, w))
  const data = {
    exportedAt: new Date().toISOString(),
    workspace,
    subscription: (await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, w)))[0] ?? null,
    payments: await ctx.db.select({ orderId: payments.orderId, amount: payments.amount, status: payments.status, planSlug: payments.planSlug, period: payments.period, paidAt: payments.paidAt, createdAt: payments.createdAt })
      .from(payments).where(eq(payments.workspaceId, w)),
    members,
    notifications: await ctx.db.select({ title: notifications.title, body: notifications.body, createdAt: notifications.createdAt })
      .from(notifications).where(eq(notifications.workspaceId, w)).orderBy(desc(notifications.createdAt)).limit(500),
    socialAccounts: await ctx.db.select({ platform: socialAccounts.platform, username: socialAccounts.username, status: socialAccounts.status, createdAt: socialAccounts.createdAt })
      .from(socialAccounts).where(eq(socialAccounts.workspaceId, w)),
    posts: await ctx.db.select().from(posts).where(eq(posts.workspaceId, w)),
    postTargets: await ctx.db.select({ postId: postTargets.postId, platform: postTargets.platform, format: postTargets.format, status: postTargets.status, scheduledAt: postTargets.scheduledAt, publishedAt: postTargets.publishedAt, permalink: postTargets.permalink })
      .from(postTargets).where(eq(postTargets.workspaceId, w)),
    media: await ctx.db.select({ id: mediaAssets.id, kind: mediaAssets.kind, mime: mediaAssets.mime, bytes: mediaAssets.bytes, publicUrl: mediaAssets.publicUrl, createdAt: mediaAssets.createdAt })
      .from(mediaAssets).where(eq(mediaAssets.workspaceId, w)),
    links: await ctx.db.select().from(links).where(eq(links.workspaceId, w)),
    hashtagSets: await ctx.db.select({ name: hashtagSets.name, tags: hashtagSets.tags, createdAt: hashtagSets.createdAt }).from(hashtagSets).where(eq(hashtagSets.workspaceId, w)),
    contentIdeas: {
      ideas: await ctx.db.select().from(contentIdeas).where(eq(contentIdeas.workspaceId, w)),
      products: await ctx.db.select().from(contentIdeaLinks).where(eq(contentIdeaLinks.workspaceId, w)),
      media: await ctx.db.select().from(contentIdeaMedia).where(eq(contentIdeaMedia.workspaceId, w))
    },
    shortLinks: await ctx.db.select({ slug: shortLinks.slug, domain: shortLinks.domain, linkId: shortLinks.linkId, source: shortLinks.source, active: shortLinks.active, createdAt: shortLinks.createdAt })
      .from(shortLinks).where(eq(shortLinks.workspaceId, w)),
    etalase: {
      pages: await ctx.db.select().from(bioPages).where(eq(bioPages.workspaceId, w)),
      items: await ctx.db.select().from(bioItems).where(eq(bioItems.workspaceId, w))
    },
    autoReply: {
      rules: await ctx.db.select().from(dmRules).where(eq(dmRules.workspaceId, w)),
      events: await ctx.db.select({ commenterUsername: dmEvents.commenterUsername, status: dmEvents.status, createdAt: dmEvents.createdAt })
        .from(dmEvents).where(eq(dmEvents.workspaceId, w))
    }
  }
  await recordAudit(ctx, { audience: 'creator', action: 'account.export', workspaceId: w, metadata: { userId: ctx.userId } })
  return { filename: `socialz-data-${workspace?.slug ?? 'export'}.json`, data }
}

export const deleteRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
  confirmation: z.literal(true, { error: 'Centang konfirmasi untuk melanjutkan.' })
})

/** A request, not a purge: staff handle it within the SLA (docs/blueprint/05 §8). */
export async function requestWorkspaceDeletion(ctx: WorkspaceContext, input: z.infer<typeof deleteRequestSchema>) {
  assertAbility(ctx, 'account.manage')
  // Claim-by-update: a second request finds delete_requested_at already set and gets 409.
  const rows = await ctx.db.update(workspaces).set({ deleteRequestedAt: new Date() })
    .where(and(eq(workspaces.id, ctx.workspaceId), isNull(workspaces.deleteRequestedAt)))
    .returning({ name: workspaces.name })
  if (!rows.length) throw appError(409, 'Permintaan hapus akun sudah dikirim sebelumnya.', 'CONFLICT')
  await recordAudit(ctx, { audience: 'creator', action: 'workspace.delete_request', workspaceId: ctx.workspaceId, metadata: { userId: ctx.userId, reason: input.reason ?? null } })
  await notifyStaff(ctx, 'workspaces.write', {
    title: `Permintaan hapus akun: ${rows[0]!.name}`,
    body: input.reason || 'Tanpa alasan.',
    actionUrl: `/admin/workspaces/${ctx.workspaceId}`,
    level: 'warning'
  })
  return { slaDays: await getSettingNumber('privacy.deleteRequestSlaDays', 30) }
}
