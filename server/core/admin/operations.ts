import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { recordAudit } from '../audit'
import { assertPermission, systemContext, type StaffContext } from '../context'
import { bioPages, dmEvents, links, postTargets, publishAttempts, shortLinks, socialAccounts, webhookEvents, workspaces } from '../db/schema'
import { appError } from '../errors'
import { enqueue } from '../jobs/enqueue'
import { kick } from '../jobs/runner'
import type { Database } from '../db/client'
import { notifyWorkspaceOwners } from '../notifications'
import { retryTarget } from '../publishing/service'
import { getSettingJson } from '../settings'
import { hostAllowed } from '../../../shared/utils/links'
import { PLATFORM_META } from '../../../shared/channels/registry'

const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default('')
})
const audit = (ctx: StaffContext, action: string, extra: { workspaceId?: string | null, targetType?: string, targetId?: string, metadata?: Record<string, unknown> }) =>
  recordAudit(ctx, { audience: 'staff', action, actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, ...extra })

// ---------------------------------------------------------------- publish failures

const FAILED_STATES = ['failed', 'publish_unknown', 'quota_deferred', 'needs_reauth'] as const
export const failuresQuery = listQuery.extend({
  platform: z.enum(['all', 'instagram', 'threads', 'facebook']).default('all'),
  errorCode: z.string().max(60).default(''),
  range: z.enum(['24h', '7d', '30d']).default('7d')
})

/** Grouped counts by error code on top help spot a Meta outage or a Graph version problem (09 §3.3). */
export async function listPublishFailures(ctx: StaffContext, query: z.infer<typeof failuresQuery>) {
  assertPermission(ctx, 'publishing.read')
  const since = new Date(Date.now() - ({ '24h': 1, '7d': 7, '30d': 30 }[query.range]) * 86_400_000)
  const base = and(inArray(postTargets.status, [...FAILED_STATES]), gte(postTargets.updatedAt, since), query.platform !== 'all' ? eq(postTargets.platform, query.platform) : undefined)
  const where = and(base, query.errorCode ? eq(postTargets.lastErrorCode, query.errorCode) : undefined, query.search ? ilike(workspaces.name, `%${query.search}%`) : undefined)
  const [items, [total], groups] = await Promise.all([
    ctx.db.select({
      id: postTargets.id, workspaceId: postTargets.workspaceId, workspaceName: workspaces.name, platform: postTargets.platform, format: postTargets.format, status: postTargets.status,
      scheduledAt: postTargets.scheduledAt, attemptCount: postTargets.attemptCount, lastErrorCode: postTargets.lastErrorCode, lastErrorMsg: postTargets.lastErrorMsg, updatedAt: postTargets.updatedAt
    }).from(postTargets).innerJoin(workspaces, eq(workspaces.id, postTargets.workspaceId)).where(where).orderBy(desc(postTargets.updatedAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(postTargets).innerJoin(workspaces, eq(workspaces.id, postTargets.workspaceId)).where(where),
    ctx.db.select({ code: sql<string>`coalesce(${postTargets.lastErrorCode}, ${postTargets.status}::text)`, n: count() }).from(postTargets).where(base).groupBy(sql`1`).orderBy(desc(count()))
  ])
  const attempts = items.length
    ? await ctx.db.select({ postTargetId: publishAttempts.postTargetId, step: publishAttempts.step, outcome: publishAttempts.outcome, errorCode: publishAttempts.errorCode, errorSubcode: publishAttempts.errorSubcode, fbtraceId: publishAttempts.fbtraceId, createdAt: publishAttempts.createdAt })
        .from(publishAttempts).where(inArray(publishAttempts.postTargetId, items.map(i => i.id))).orderBy(desc(publishAttempts.createdAt))
    : []
  return { items: items.map(item => ({ ...item, attempts: attempts.filter(a => a.postTargetId === item.id).slice(0, 3) })), groups, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

/** Re-enqueue from the stored step (never a blind republish; a target that reached publishing is reconciled first). */
export async function retryPublishFailure(ctx: StaffContext, targetId: string) {
  assertPermission(ctx, 'publishing.write')
  const [target] = await ctx.db.select({ workspaceId: postTargets.workspaceId }).from(postTargets).where(eq(postTargets.id, targetId)).limit(1)
  if (!target) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
  const { jobId } = await retryTarget(systemContext(target.workspaceId, ctx), targetId, { staff: true })
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  await audit(ctx, 'publishing.retry', { workspaceId: target.workspaceId, targetType: 'post_target', targetId })
}

/** Nudges the owners to reconnect the account behind a target (the staff-side answer to an `auth` failure, where a retry cannot help). One bell per account per UTC day, like the pipeline's own notice. */
export async function remindReconnect(ctx: StaffContext, targetId: string) {
  assertPermission(ctx, 'publishing.write')
  const [row] = await ctx.db.select({ workspaceId: postTargets.workspaceId, accountId: socialAccounts.id, platform: socialAccounts.platform, username: socialAccounts.username })
    .from(postTargets).innerJoin(socialAccounts, eq(socialAccounts.id, postTargets.socialAccountId)).where(eq(postTargets.id, targetId)).limit(1)
  if (!row) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
  await notifyWorkspaceOwners(ctx, row.workspaceId, {
    templateKey: 'account_reconnect_needed',
    dedupeKey: `account_reconnect_needed:${row.accountId}:${new Date().toISOString().slice(0, 10)}`,
    variables: { platformLabel: PLATFORM_META[row.platform].name, accountName: row.username ?? '', reconnectUrl: '/app/accounts' }
  })
  await audit(ctx, 'publishing.remind_reconnect', { workspaceId: row.workspaceId, targetType: 'post_target', targetId })
}

// ---------------------------------------------------------------- social account health

export const accountsQuery = listQuery.extend({
  platform: z.enum(['all', 'instagram', 'threads', 'facebook']).default('all'),
  status: z.enum(['all', 'active', 'needs_reauth', 'disabled']).default('all'),
  expiringWithinDays: z.coerce.number().int().min(0).max(90).default(0)
})

/** Tokens are never shown, not even masked. */
export async function listSocialAccountsAdmin(ctx: StaffContext, query: z.infer<typeof accountsQuery>) {
  assertPermission(ctx, 'channels.read')
  const where = and(
    sql`${socialAccounts.status} <> 'revoked'`,
    query.platform !== 'all' ? eq(socialAccounts.platform, query.platform) : undefined,
    query.status !== 'all' ? eq(socialAccounts.status, query.status) : undefined,
    query.expiringWithinDays ? and(isNotNull(socialAccounts.tokenExpiresAt), lte(socialAccounts.tokenExpiresAt, new Date(Date.now() + query.expiringWithinDays * 86_400_000))) : undefined,
    query.search ? or(ilike(socialAccounts.username, `%${query.search}%`), ilike(workspaces.name, `%${query.search}%`)) : undefined
  )
  const [items, [total], [reauth]] = await Promise.all([
    ctx.db.select({
      id: socialAccounts.id, platform: socialAccounts.platform, username: socialAccounts.username, status: socialAccounts.status, tokenExpiresAt: socialAccounts.tokenExpiresAt,
      scopes: socialAccounts.scopes, workspaceId: socialAccounts.workspaceId, workspaceName: workspaces.name, createdAt: socialAccounts.createdAt,
      lastPublishedAt: sql<string | null>`(select max(t.published_at) from post_targets t where t.social_account_id = ${socialAccounts.id} and t.status = 'published')`
    }).from(socialAccounts).innerJoin(workspaces, eq(workspaces.id, socialAccounts.workspaceId)).where(where).orderBy(desc(socialAccounts.updatedAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(socialAccounts).innerJoin(workspaces, eq(workspaces.id, socialAccounts.workspaceId)).where(where),
    ctx.db.select({ n: count() }).from(socialAccounts).where(eq(socialAccounts.status, 'needs_reauth'))
  ])
  return { items, needsReauth: reauth?.n ?? 0, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

export async function refreshSocialAccountAdmin(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'channels.write')
  const [account] = await ctx.db.select({ id: socialAccounts.id, workspaceId: socialAccounts.workspaceId }).from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1)
  if (!account) throw appError(404, 'Akun tidak ditemukan.', 'NOT_FOUND')
  const jobId = await enqueue(ctx.db, 'token.refresh.one', { socialAccountId: id, workspaceId: account.workspaceId }, { singletonKey: `refresh:${id}` })
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  await audit(ctx, 'social_account.refresh', { workspaceId: account.workspaceId, targetType: 'social_account', targetId: id })
}

// ---------------------------------------------------------------- link + Etalase moderation

export const linksQuery = listQuery.extend({ flagged: z.enum(['all', 'outside', 'disabled']).default('all') })

export async function listShortLinksAdmin(ctx: StaffContext, query: z.infer<typeof linksQuery>) {
  assertPermission(ctx, 'links.read')
  const like = `%${query.search}%`
  const where = and(
    query.search ? or(ilike(shortLinks.slug, like), ilike(links.destinationUrl, like), ilike(workspaces.name, like)) : undefined,
    query.flagged === 'disabled' ? eq(shortLinks.active, false) : undefined,
    eq(shortLinks.source, 'vault')
  )
  const allowlist = await getSettingJson<string[]>('channels.links.affiliateAllowlist', [], ctx.db)
  const [rows, [total]] = await Promise.all([
    ctx.db.select({
      id: shortLinks.id, slug: shortLinks.slug, active: shortLinks.active, destinationUrl: links.destinationUrl, title: links.title, workspaceId: shortLinks.workspaceId, workspaceName: workspaces.name, createdAt: shortLinks.createdAt,
      clicks7d: sql<number>`(select count(*)::int from link_clicks c join short_links s2 on s2.id = c.short_link_id where s2.link_id = ${shortLinks.linkId} and c.clicked_at > now() - interval '7 days' and not c.is_bot)`
    }).from(shortLinks).innerJoin(links, eq(links.id, shortLinks.linkId)).innerJoin(workspaces, eq(workspaces.id, shortLinks.workspaceId))
      .where(where).orderBy(desc(shortLinks.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(shortLinks).innerJoin(links, eq(links.id, shortLinks.linkId)).innerJoin(workspaces, eq(workspaces.id, shortLinks.workspaceId)).where(where)
  ])
  const items = rows.map((row) => {
    const domain = (() => {
      try {
        return new URL(row.destinationUrl).hostname
      } catch {
        return ''
      }
    })()
    return { ...row, domain, onAllowlist: hostAllowed(row.destinationUrl, allowlist) }
  })
  return { items: query.flagged === 'outside' ? items.filter(i => !i.onAllowlist) : items, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

export const moderationSchema = z.object({ reason: z.string().trim().min(3, 'Tulis alasannya; pemilik akun akan menerimanya.').max(300) })

/** Disabling one product disables all of its short links (post, Etalase, DM copies); the redirect then explains. */
export async function setLinkActive(ctx: StaffContext, shortLinkId: string, active: boolean, reason?: string) {
  assertPermission(ctx, 'links.write')
  const [row] = await ctx.db.select({ linkId: shortLinks.linkId, workspaceId: shortLinks.workspaceId, slug: shortLinks.slug, title: links.title }).from(shortLinks).innerJoin(links, eq(links.id, shortLinks.linkId)).where(eq(shortLinks.id, shortLinkId)).limit(1)
  if (!row) throw appError(404, 'Link tidak ditemukan.', 'NOT_FOUND')
  await ctx.db.update(shortLinks).set({ active, updatedAt: new Date() }).where(eq(shortLinks.linkId, row.linkId))
  if (!active) {
    await notifyWorkspaceOwners(ctx, row.workspaceId, {
      title: 'Link produk dinonaktifkan', body: `"${row.title ?? row.slug}" dinonaktifkan tim Socialz.id: ${reason}`, level: 'warning', actionUrl: '/app/links', icon: 'i-lucide-shield-alert',
      dedupeKey: `link_disabled:${row.linkId}:${Date.now()}`
    })
  }
  await audit(ctx, active ? 'link.enable' : 'link.disable', { workspaceId: row.workspaceId, targetType: 'link', targetId: row.linkId, metadata: { slug: row.slug, reason } })
}

export async function listBioPagesAdmin(ctx: StaffContext, query: z.infer<typeof listQuery>) {
  assertPermission(ctx, 'links.read')
  const where = query.search ? or(ilike(bioPages.handle, `%${query.search}%`), ilike(workspaces.name, `%${query.search}%`)) : undefined
  const [items, [total]] = await Promise.all([
    ctx.db.select({ id: bioPages.id, handle: bioPages.handle, title: bioPages.title, published: bioPages.published, workspaceId: bioPages.workspaceId, workspaceName: workspaces.name, updatedAt: bioPages.updatedAt })
      .from(bioPages).innerJoin(workspaces, eq(workspaces.id, bioPages.workspaceId)).where(where).orderBy(desc(bioPages.updatedAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(bioPages).innerJoin(workspaces, eq(workspaces.id, bioPages.workspaceId)).where(where)
  ])
  return { items, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

export async function unpublishBioAdmin(ctx: StaffContext, id: string, reason: string) {
  assertPermission(ctx, 'links.write')
  const [page] = await ctx.db.select().from(bioPages).where(eq(bioPages.id, id)).limit(1)
  if (!page) throw appError(404, 'Etalase tidak ditemukan.', 'NOT_FOUND')
  await ctx.db.update(bioPages).set({ published: false, updatedAt: new Date() }).where(eq(bioPages.id, id))
  await notifyWorkspaceOwners(ctx, page.workspaceId, {
    title: 'Etalase diturunkan', body: `Etalase @${page.handle} disembunyikan tim Socialz.id: ${reason}`, level: 'warning', actionUrl: '/app/bio', icon: 'i-lucide-shield-alert',
    dedupeKey: `bio_unpublished:${id}:${Date.now()}`
  })
  await audit(ctx, 'bio.moderate_unpublish', { workspaceId: page.workspaceId, targetType: 'bio_page', targetId: id, metadata: { handle: page.handle, reason } })
}

// ---------------------------------------------------------------- Meta webhook inbox

export const metaWebhooksQuery = listQuery.extend({ state: z.enum(['all', 'pending', 'error', 'processed']).default('all'), topic: z.string().max(60).default('') })

/** Operational metadata only; comment text is shown to superadmins alone (09 §3.3). */
export async function listMetaWebhooks(ctx: StaffContext, query: z.infer<typeof metaWebhooksQuery>) {
  assertPermission(ctx, 'channels.read')
  const where = and(
    eq(webhookEvents.provider, 'meta'),
    query.topic ? eq(webhookEvents.topic, query.topic) : undefined,
    query.state === 'pending' ? isNull(webhookEvents.processedAt) : query.state === 'error' ? isNotNull(webhookEvents.error) : query.state === 'processed' ? and(isNotNull(webhookEvents.processedAt), isNull(webhookEvents.error)) : undefined,
    query.search ? ilike(webhookEvents.dedupeKey, `%${query.search}%`) : undefined
  )
  const [rows, [total], [backlog]] = await Promise.all([
    ctx.db.select().from(webhookEvents).where(where).orderBy(desc(webhookEvents.receivedAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(webhookEvents).where(where),
    ctx.db.select({ n: count() }).from(webhookEvents).where(and(eq(webhookEvents.provider, 'meta'), isNull(webhookEvents.processedAt)))
  ])
  const redact = (payload: unknown) => {
    if (ctx.isSuperAdmin || !payload || typeof payload !== 'object') return payload
    const copy = structuredClone(payload) as { value?: Record<string, unknown> }
    if (copy.value && 'text' in copy.value) copy.value.text = '[disembunyikan]'
    return copy
  }
  return { items: rows.map(row => ({ ...row, payload: redact(row.payload) })), backlog: backlog?.n ?? 0, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

/** Replays re-run processing; the dm_events unique key keeps a replay from sending a second DM. */
export async function replayMetaWebhook(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'channels.write')
  const rows = await ctx.db.update(webhookEvents).set({ processedAt: null, error: null }).where(and(eq(webhookEvents.id, id), eq(webhookEvents.provider, 'meta'))).returning({ id: webhookEvents.id })
  if (!rows.length) throw appError(404, 'Webhook tidak ditemukan.', 'NOT_FOUND')
  const jobId = await enqueue(ctx.db, 'webhook.meta', { webhookEventId: id }, { singletonKey: `replay:${id}:${Date.now()}` })
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  await audit(ctx, 'meta.webhook_replay', { targetType: 'webhook_event', targetId: id })
}

// dm_events is the creator's audience data; only counts leave this module.
export async function dmSentToday(db: StaffContext['db']): Promise<number> {
  const [row] = await db.select({ n: count() }).from(dmEvents).where(and(eq(dmEvents.status, 'dm_sent'), gte(dmEvents.updatedAt, new Date(Date.now() - 86_400_000))))
  return row?.n ?? 0
}
