import { and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { CHANNELS, PLATFORM_META } from '../../../shared/channels/registry'
import { defaultFormat } from '../../../shared/channels/formats'
import type { MediaMeta, PostFormat } from '../../../shared/channels/types'
import { hasBlockingIssues, validateTarget } from '../../../shared/channels/validate'
import { CONTENT_PILLARS } from '../../../shared/utils/planner'
import { recordAudit } from '../audit'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Database, Executor } from '../db/client'
import { dmEvents, jobs, linkClicks, mediaAssets, postMedia, posts, postTargetChanges, postTargets, publishAttempts, shortLinks, socialAccounts, workspaces } from '../db/schema'
import { latestInsights } from '../engagement-jobs'
import { countScheduledThisMonth, getEntitlements } from '../entitlements'
import { appError } from '../errors'
import { enqueue } from '../jobs/enqueue'
import { ideaOfPost, markIdeaUsed, plannerWindow, releaseIdeasOf } from '../planner/ideas'
import { zonedDateKey } from '../timezone'
import { refreshPostStatus } from './status'

const FORMATS = ['feed', 'carousel', 'reel', 'story', 'text'] as const

export const targetInputSchema = z.object({
  socialAccountId: z.string().min(1),
  format: z.enum(FORMATS).optional(), // omitted = smart default from the media
  captionOverride: z.string().max(70_000).nullable().optional(),
  firstComment: z.string().trim().max(2200).optional(),
  altText: z.string().trim().max(1000).optional()
})

export const postInputSchema = z.object({
  caption: z.string().max(70_000).default(''),
  mediaIds: z.array(z.string()).max(20).default([]),
  targets: z.array(targetInputSchema).min(1, 'Pilih minimal satu akun.').max(30),
  mode: z.enum(['draft', 'schedule', 'now']),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  pillar: z.enum(CONTENT_PILLARS).nullable().optional(), // omitted on update = keep
  ideaId: z.string().min(1).optional() // Bank Ide → "Jadikan postingan": the idea leaves the bank
})
export type PostInput = z.infer<typeof postInputSchema>

function caption(base: string, override?: string | null) {
  return override?.trim() ? override : base
}

/** Resolves accounts and media inside the workspace (404 for anything else) and validates every target. */
async function resolveDraft(ctx: WorkspaceContext, input: PostInput) {
  const accountIds = [...new Set(input.targets.map(t => t.socialAccountId))]
  const accounts = await ctx.db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, ctx.workspaceId), inArray(socialAccounts.id, accountIds)))
  if (accounts.length !== accountIds.length) throw appError(404, 'Akun tidak ditemukan.', 'NOT_FOUND')
  const media = input.mediaIds.length
    ? await ctx.db.select().from(mediaAssets).where(and(eq(mediaAssets.workspaceId, ctx.workspaceId), inArray(mediaAssets.id, input.mediaIds)))
    : []
  if (media.length !== new Set(input.mediaIds).size) throw appError(404, 'Media tidak ditemukan.', 'NOT_FOUND')
  const ordered = input.mediaIds.map(id => media.find(m => m.id === id)!)
  const metas: MediaMeta[] = ordered.map(m => ({ kind: m.kind, mime: m.mime, bytes: m.bytes, width: m.width, height: m.height, durationMs: m.durationMs, codec: m.codec }))
  const resolved = input.targets.map((t) => {
    const account = accounts.find(a => a.id === t.socialAccountId)!
    const format: PostFormat = t.format ?? defaultFormat(account.platform, metas)
    return { input: t, account, format, caption: caption(input.caption, t.captionOverride) }
  })
  if (input.mode !== 'draft') {
    const issues = resolved.flatMap(r => validateTarget(CHANNELS[r.account.platform], { format: r.format, caption: r.caption, firstComment: r.input.firstComment }, metas)
      .map(issue => ({ ...issue, socialAccountId: r.account.id, platform: r.account.platform })))
    if (hasBlockingIssues(issues)) {
      throw appError(422, 'Ada yang perlu diperbaiki sebelum dijadwalkan.', 'CHANNEL_VALIDATION_FAILED', { issues: issues.filter(i => i.level === 'error') })
    }
    const notReady = ordered.find(m => m.status !== 'ready')
    if (notReady) throw appError(409, notReady.status === 'failed' ? 'Ada media yang gagal diproses. Hapus lalu unggah lagi.' : 'Media masih disiapkan. Tunggu sebentar lalu coba lagi.', 'CONFLICT', { mediaId: notReady.id })
    const inactive = resolved.find(r => r.account.status !== 'active')
    if (inactive) throw appError(409, `${PLATFORM_META[inactive.account.platform].name} ${inactive.account.username ?? ''} perlu dihubungkan ulang dulu.`.trim(), 'ACCOUNT_REAUTH_REQUIRED', { socialAccountId: inactive.account.id })
  }
  return { resolved, media: ordered }
}

function resolveSchedule(input: PostInput): Date | null {
  if (input.mode === 'draft') return input.scheduledAt ? new Date(input.scheduledAt) : null
  if (input.mode === 'now') return new Date()
  if (!input.scheduledAt) throw appError(400, 'Pilih waktu jadwal.', 'VALIDATION_FAILED', { field: 'scheduledAt' })
  const at = new Date(input.scheduledAt)
  if (at.getTime() < Date.now() - 60_000) throw appError(400, 'Waktu jadwal sudah lewat. Pilih waktu yang akan datang.', 'VALIDATION_FAILED', { field: 'scheduledAt' })
  if (at.getTime() > Date.now() + 365 * 86_400_000) throw appError(400, 'Jadwal maksimal satu tahun ke depan.', 'VALIDATION_FAILED', { field: 'scheduledAt' })
  return at
}

/** Monthly allowance counts per target, in the month the target is scheduled for (docs/blueprint/06 §5). */
async function assertMonthlyAllowance(ctx: WorkspaceContext, adding: number, excludePostId?: string) {
  const { limits, planName } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  const max = limits.scheduledPostsPerMonth
  if (max === -1) return
  const tz = (await ctx.db.execute<{ timezone: string }>(sql`select timezone from workspaces where id = ${ctx.workspaceId}`)).rows[0]?.timezone ?? 'Asia/Jakarta'
  let current = await countScheduledThisMonth(ctx.db, ctx.workspaceId, tz)
  if (excludePostId) {
    const [own] = await ctx.db.select({ n: count() }).from(postTargets).where(and(eq(postTargets.postId, excludePostId), sql`${postTargets.status} not in ('draft', 'cancelled')`))
    current -= own?.n ?? 0
  }
  if (current + adding > max) {
    const left = Math.max(0, max - current)
    throw appError(402, `Paket ${planName} mengizinkan ${new Intl.NumberFormat('id-ID').format(max)} postingan terjadwal per bulan. Sisa bulan ini: ${left}.`, 'LIMIT_REACHED', { limit: 'scheduledPostsPerMonth', max, current, adding })
  }
}

async function enqueueTargets(tx: Executor, workspaceId: string, targetIds: string[], runAt: Date, version: number) {
  for (const id of targetIds) {
    const jobId = await enqueue(tx, 'publish.target', { targetId: id, workspaceId, version }, { runAt, singletonKey: `${id}:v${version}` })
    await tx.update(postTargets).set({ jobId }).where(eq(postTargets.id, id))
  }
}

/** POST /api/app/posts. "now" and "schedule" enqueue one publish.target per target in the same transaction. */
export async function createPost(ctx: WorkspaceContext, input: PostInput) {
  assertAbility(ctx, 'posts.write')
  const scheduledAt = resolveSchedule(input)
  const { resolved, media } = await resolveDraft(ctx, input)
  if (input.mode !== 'draft') await assertMonthlyAllowance(ctx, resolved.length)
  const status = input.mode === 'draft' ? 'draft' as const : 'scheduled' as const
  const result = await ctx.db.transaction(async (tx) => {
    const [post] = await tx.insert(posts).values({ workspaceId: ctx.workspaceId, authorUserId: ctx.userId, baseCaption: input.caption, status, scheduledAt, pillar: input.pillar ?? null }).returning()
    if (media.length) await tx.insert(postMedia).values(media.map((m, position) => ({ workspaceId: ctx.workspaceId, postId: post!.id, position, mediaId: m.id })))
    const targets = await tx.insert(postTargets).values(resolved.map(r => ({
      workspaceId: ctx.workspaceId, postId: post!.id, socialAccountId: r.account.id, platform: r.account.platform, format: r.format,
      captionOverride: r.input.captionOverride?.trim() ? r.input.captionOverride : null,
      options: { firstComment: r.input.firstComment || undefined, altText: r.input.altText || undefined },
      status, scheduledAt
    }))).returning({ id: postTargets.id })
    if (status === 'scheduled') await enqueueTargets(tx, ctx.workspaceId, targets.map(t => t.id), scheduledAt!, post!.version)
    if (input.ideaId) await markIdeaUsed(tx, ctx.workspaceId, input.ideaId, post!.id)
    return { postId: post!.id, jobIds: (await tx.select({ jobId: postTargets.jobId }).from(postTargets).where(eq(postTargets.postId, post!.id))).map(r => r.jobId) }
  })
  return { ...result, kick: input.mode === 'now' }
}

/**
 * PATCH /api/app/posts/:id — edit and/or reschedule a post that hasn't started publishing.
 * Bumps posts.version and cancels the old jobs; stale jobs exit when they see the version mismatch.
 */
export async function updatePost(ctx: WorkspaceContext, postId: string, input: PostInput) {
  assertAbility(ctx, 'posts.write')
  const [post] = await ctx.db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspaceId))).limit(1)
  if (!post) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
  const current = await ctx.db.select().from(postTargets).where(eq(postTargets.postId, postId))
  if (current.some(t => !['draft', 'scheduled', 'cancelled', 'quota_deferred', 'needs_reauth'].includes(t.status))) {
    throw appError(409, 'Postingan ini sedang atau sudah terbit, jadi tidak bisa diubah. Duplikat saja untuk membuat versi baru.', 'CONFLICT')
  }
  const scheduledAt = resolveSchedule(input)
  const { resolved, media } = await resolveDraft(ctx, input)
  if (input.mode !== 'draft') await assertMonthlyAllowance(ctx, resolved.length, postId)
  const status = input.mode === 'draft' ? 'draft' as const : 'scheduled' as const
  const version = post.version + 1
  const result = await ctx.db.transaction(async (tx) => {
    const oldJobs = current.map(t => t.jobId).filter((id): id is string => Boolean(id))
    if (oldJobs.length) await tx.update(jobs).set({ status: 'cancelled', finishedAt: new Date() }).where(and(inArray(jobs.id, oldJobs), eq(jobs.status, 'queued')))
    await tx.update(posts).set({ baseCaption: input.caption, status, scheduledAt, version, ...(input.pillar !== undefined && { pillar: input.pillar }), updatedAt: new Date() }).where(eq(posts.id, postId))
    await tx.delete(postMedia).where(eq(postMedia.postId, postId))
    if (media.length) await tx.insert(postMedia).values(media.map((m, position) => ({ workspaceId: ctx.workspaceId, postId, position, mediaId: m.id })))
    await tx.delete(postTargets).where(eq(postTargets.postId, postId))
    const targets = await tx.insert(postTargets).values(resolved.map(r => ({
      workspaceId: ctx.workspaceId, postId, socialAccountId: r.account.id, platform: r.account.platform, format: r.format,
      captionOverride: r.input.captionOverride?.trim() ? r.input.captionOverride : null,
      options: { firstComment: r.input.firstComment || undefined, altText: r.input.altText || undefined },
      status, scheduledAt
    }))).returning({ id: postTargets.id })
    if (status === 'scheduled') await enqueueTargets(tx, ctx.workspaceId, targets.map(t => t.id), scheduledAt!, version)
    if (input.ideaId) await markIdeaUsed(tx, ctx.workspaceId, input.ideaId, postId)
    return { postId, jobIds: (await tx.select({ jobId: postTargets.jobId }).from(postTargets).where(eq(postTargets.postId, postId))).map(r => r.jobId) }
  })
  return { ...result, kick: input.mode === 'now' }
}

/** Calendar drag: move only the time, keeping everything else. */
export async function reschedulePost(ctx: WorkspaceContext, postId: string, scheduledAt: string) {
  const detail = await getPost(ctx, postId)
  return updatePost(ctx, postId, {
    caption: detail.caption,
    mediaIds: detail.media.map(m => m.id),
    targets: detail.targets.map(t => ({ socialAccountId: t.socialAccountId, format: t.format, captionOverride: t.captionOverride, firstComment: t.options.firstComment, altText: t.options.altText })),
    mode: detail.status === 'draft' ? 'draft' : 'schedule',
    scheduledAt,
    pillar: detail.pillar
  })
}

export async function cancelPost(ctx: WorkspaceContext, postId: string) {
  assertAbility(ctx, 'posts.write')
  const rows = await ctx.db.update(postTargets).set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(postTargets.postId, postId), eq(postTargets.workspaceId, ctx.workspaceId), inArray(postTargets.status, ['draft', 'scheduled', 'quota_deferred', 'needs_reauth'])))
    .returning({ jobId: postTargets.jobId })
  if (!rows.length) {
    const [exists] = await ctx.db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspaceId)))
    if (!exists) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
    throw appError(409, 'Postingan ini sudah diproses dan tidak bisa dibatalkan.', 'CONFLICT')
  }
  const jobIds = rows.map(r => r.jobId).filter((id): id is string => Boolean(id))
  if (jobIds.length) await ctx.db.update(jobs).set({ status: 'cancelled', finishedAt: new Date() }).where(and(inArray(jobs.id, jobIds), eq(jobs.status, 'queued')))
  await refreshPostStatus(ctx.db, postId)
  await recordAudit(ctx, { audience: 'creator', action: 'post.cancel', workspaceId: ctx.workspaceId, targetType: 'post', targetId: postId, metadata: { userId: ctx.userId } })
  return { success: true }
}

/** "Coba lagi": a failed target goes back to scheduled now, resuming from its stored step (never a blind republish). */
export async function retryTarget(ctx: WorkspaceContext, targetId: string, options: { staff?: boolean } = {}) {
  if (!options.staff) assertAbility(ctx, 'posts.write')
  const [target] = await ctx.db.select().from(postTargets).where(and(eq(postTargets.id, targetId), eq(postTargets.workspaceId, ctx.workspaceId))).limit(1)
  if (!target) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
  if (!['failed', 'needs_reauth', 'quota_deferred'].includes(target.status)) throw appError(409, 'Postingan ini tidak perlu dicoba lagi.', 'CONFLICT')
  const [post] = await ctx.db.select({ version: posts.version }).from(posts).where(eq(posts.id, target.postId))
  const jobId = await ctx.db.transaction(async (tx) => {
    // A step-less retry restarts from prepare; a target that reached publishing is reconciled first.
    const resumeUnknown = target.step === 'publishing'
    await tx.update(postTargets).set({ status: resumeUnknown ? 'publish_unknown' : 'scheduled', step: resumeUnknown ? 'publishing' : null, containerIds: resumeUnknown ? target.containerIds : [], lastErrorCode: null, lastErrorMsg: null, scheduledAt: target.scheduledAt ?? new Date(), updatedAt: new Date() })
      .where(eq(postTargets.id, targetId))
    const id = await enqueue(tx, resumeUnknown ? 'publish.reconcile' : 'publish.target', { targetId, workspaceId: ctx.workspaceId, version: post!.version }, { singletonKey: `${targetId}:retry:${Date.now()}` })
    await tx.update(postTargets).set({ jobId: id }).where(eq(postTargets.id, targetId))
    return id
  })
  await refreshPostStatus(ctx.db, target.postId)
  await recordAudit(ctx, { audience: options.staff ? 'staff' : 'creator', action: 'post.retry', workspaceId: ctx.workspaceId, targetType: 'post_target', targetId, metadata: { userId: ctx.userId } })
  return { jobId }
}

export async function deletePost(ctx: WorkspaceContext, postId: string) {
  assertAbility(ctx, 'posts.write')
  const targets = await ctx.db.select({ status: postTargets.status, jobId: postTargets.jobId }).from(postTargets).where(and(eq(postTargets.postId, postId), eq(postTargets.workspaceId, ctx.workspaceId)))
  // History is kept: published posts are records, not drafts (docs/blueprint/18 §3).
  if (targets.some(t => ['published', 'preparing', 'processing', 'publishing', 'publish_unknown'].includes(t.status))) {
    throw appError(409, 'Postingan yang sudah terbit tidak bisa dihapus dari riwayat.', 'CONFLICT')
  }
  const jobIds = targets.map(t => t.jobId).filter((id): id is string => Boolean(id))
  await ctx.db.transaction(async (tx) => {
    if (jobIds.length) await tx.update(jobs).set({ status: 'cancelled', finishedAt: new Date() }).where(and(inArray(jobs.id, jobIds), eq(jobs.status, 'queued')))
    await releaseIdeasOf(tx, ctx.workspaceId, postId)
    const deleted = await tx.delete(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspaceId))).returning({ id: posts.id })
    if (!deleted.length) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
  })
  return { success: true }
}

export async function getPost(ctx: WorkspaceContext, postId: string) {
  assertAbility(ctx, 'posts.read')
  const [post] = await ctx.db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspaceId))).limit(1)
  if (!post) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
  const [media, targets] = await Promise.all([
    ctx.db.select({ id: mediaAssets.id, kind: mediaAssets.kind, url: mediaAssets.publicUrl, status: mediaAssets.status, width: mediaAssets.width, height: mediaAssets.height, durationMs: mediaAssets.durationMs })
      .from(postMedia).innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId)).where(eq(postMedia.postId, postId)).orderBy(asc(postMedia.position)),
    ctx.db.select({ target: postTargets, username: socialAccounts.username, avatarUrl: socialAccounts.avatarUrl, accountStatus: socialAccounts.status })
      .from(postTargets).innerJoin(socialAccounts, eq(socialAccounts.id, postTargets.socialAccountId)).where(eq(postTargets.postId, postId)).orderBy(asc(postTargets.platform))
  ])
  // Numbers per target (SCREENS #16): latest platform insights, clicks on its attribution links, auto-replies sent.
  const targetIds = targets.map(row => row.target.id)
  const [insights, clicks, dms, changes, idea] = await Promise.all([
    latestInsights(ctx.db as Database, targetIds),
    targetIds.length
      ? ctx.db.select({ targetId: shortLinks.postTargetId, n: sql<number>`count(${linkClicks.id})::int` }).from(shortLinks)
          .leftJoin(linkClicks, and(eq(linkClicks.shortLinkId, shortLinks.id), eq(linkClicks.isBot, false)))
          .where(and(eq(shortLinks.workspaceId, ctx.workspaceId), inArray(shortLinks.postTargetId, targetIds))).groupBy(shortLinks.postTargetId)
      : [],
    targets.some(row => row.target.externalId)
      ? ctx.db.select({ mediaId: dmEvents.mediaId, n: sql<number>`count(*)::int` }).from(dmEvents)
          .where(and(eq(dmEvents.workspaceId, ctx.workspaceId), eq(dmEvents.status, 'dm_sent'), inArray(dmEvents.mediaId, targets.map(row => row.target.externalId).filter((v): v is string => Boolean(v))))).groupBy(dmEvents.mediaId)
      : [],
    // What syncs noticed on the platform since publishing, newest first.
    targetIds.length
      ? ctx.db.select({ postTargetId: postTargetChanges.postTargetId, kind: postTargetChanges.kind, before: postTargetChanges.before, after: postTargetChanges.after, detectedAt: postTargetChanges.detectedAt })
          .from(postTargetChanges).where(and(eq(postTargetChanges.workspaceId, ctx.workspaceId), inArray(postTargetChanges.postTargetId, targetIds)))
          .orderBy(desc(postTargetChanges.detectedAt)).limit(100)
      : [],
    ideaOfPost(ctx.db, ctx.workspaceId, postId)
  ])
  return {
    id: post.id, caption: post.baseCaption, status: post.status, scheduledAt: post.scheduledAt, createdAt: post.createdAt, version: post.version,
    pillar: post.pillar, idea,
    media,
    targets: targets.map(({ target: t, username, avatarUrl, accountStatus }) => ({
      id: t.id, socialAccountId: t.socialAccountId, platform: t.platform, format: t.format, username, avatarUrl, accountStatus,
      captionOverride: t.captionOverride, options: t.options as { firstComment?: string, altText?: string },
      caption: t.captionOverride?.trim() ? t.captionOverride : post.baseCaption,
      status: t.status, scheduledAt: t.scheduledAt, publishedAt: t.publishedAt, syncedAt: t.syncedAt, removedAt: t.removedAt,
      // A post deleted on the platform keeps its record and numbers, but its link no longer opens anything.
      permalink: t.removedAt ? null : t.permalink,
      errorCode: t.lastErrorCode, attemptCount: t.attemptCount,
      insights: insights.get(t.id) ?? null,
      clicks: clicks.find(c => c.targetId === t.id)?.n ?? 0,
      autoReplies: t.externalId ? dms.find(d => d.mediaId === t.externalId)?.n ?? 0 : 0,
      changes: changes.filter(c => c.postTargetId === t.id).slice(0, 10).map(({ postTargetId: _, ...change }) => change)
    }))
  }
}

export const postListQuerySchema = z.object({
  tab: z.enum(['scheduled', 'draft', 'published', 'failed', 'all']).default('all'),
  platform: z.enum(['instagram', 'threads', 'facebook']).optional()
})

const TAB_STATUSES: Record<string, string[]> = {
  scheduled: ['scheduled', 'publishing'],
  draft: ['draft'],
  published: ['published', 'partial'],
  failed: ['failed', 'partial']
}

export async function listPosts(ctx: WorkspaceContext, query: { page: number, limit: number, offset: number, search: string } & z.infer<typeof postListQuerySchema>) {
  assertAbility(ctx, 'posts.read')
  const filters = and(
    eq(posts.workspaceId, ctx.workspaceId),
    query.tab !== 'all' ? inArray(posts.status, TAB_STATUSES[query.tab] as ('scheduled')[]) : undefined,
    query.search ? sql`${posts.baseCaption} ilike ${`%${query.search}%`}` : undefined,
    query.platform ? sql`exists (select 1 from post_targets pt where pt.post_id = ${posts.id} and pt.platform = ${query.platform})` : undefined
  )
  const order = query.tab === 'scheduled' ? asc(posts.scheduledAt) : desc(sql`coalesce(${posts.scheduledAt}, ${posts.createdAt})`)
  const [rows, [total]] = await Promise.all([
    ctx.db.select().from(posts).where(filters).orderBy(order).limit(query.limit).offset(query.offset),
    ctx.db.select({ n: count() }).from(posts).where(filters)
  ])
  const ids = rows.map(r => r.id)
  const [targets, thumbs] = ids.length
    ? await Promise.all([
        ctx.db.select({ id: postTargets.id, postId: postTargets.postId, platform: postTargets.platform, status: postTargets.status, removedAt: postTargets.removedAt, username: socialAccounts.username, errorCode: postTargets.lastErrorCode })
          .from(postTargets).innerJoin(socialAccounts, eq(socialAccounts.id, postTargets.socialAccountId)).where(inArray(postTargets.postId, ids)),
        ctx.db.select({ postId: postMedia.postId, url: mediaAssets.publicUrl, kind: mediaAssets.kind }).from(postMedia)
          .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId)).where(and(inArray(postMedia.postId, ids), eq(postMedia.position, 0)))
      ])
    : [[], []]
  const edits = targets.length
    ? await ctx.db.select({ postTargetId: postTargetChanges.postTargetId, at: sql<Date>`max(${postTargetChanges.detectedAt})` }).from(postTargetChanges)
        .where(and(eq(postTargetChanges.workspaceId, ctx.workspaceId), eq(postTargetChanges.kind, 'caption_changed'), inArray(postTargetChanges.postTargetId, targets.map(t => t.id))))
        .groupBy(postTargetChanges.postTargetId)
    : []
  const n = total?.n ?? 0
  return {
    items: rows.map(p => ({
      id: p.id, caption: p.baseCaption, status: p.status, scheduledAt: p.scheduledAt, createdAt: p.createdAt,
      thumbnail: thumbs.find(t => t.postId === p.id) ?? null,
      targets: targets.filter(t => t.postId === p.id).map(t => ({ ...t, editedAt: edits.find(e => e.postTargetId === t.id)?.at ?? null }))
    })),
    meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) }
  }
}

/** Every target in a date window (max 62 days): a calendar month must render whole (docs/blueprint/12 §5). */
export async function calendarWindow(ctx: WorkspaceContext, from: Date, to: Date) {
  assertAbility(ctx, 'posts.read')
  if (to.getTime() - from.getTime() > 62 * 86_400_000) throw appError(400, 'Rentang kalender maksimal 62 hari.', 'VALIDATION_FAILED')
  const [rows, [workspace]] = await Promise.all([
    ctx.db.select({ id: postTargets.id, postId: postTargets.postId, platform: postTargets.platform, status: postTargets.status, scheduledAt: postTargets.scheduledAt, publishedAt: postTargets.publishedAt, removedAt: postTargets.removedAt, caption: posts.baseCaption, pillar: posts.pillar })
      .from(postTargets).innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(and(eq(postTargets.workspaceId, ctx.workspaceId), gte(postTargets.scheduledAt, from), lt(postTargets.scheduledAt, to), sql`${postTargets.status} <> 'cancelled'`))
      .orderBy(asc(postTargets.scheduledAt)),
    ctx.db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
  ])
  // Planned ideas live on local days: the window's instants become days on the workspace clock.
  const tz = workspace?.timezone ?? 'Asia/Jakarta'
  const planner = await plannerWindow(ctx, zonedDateKey(from, tz), zonedDateKey(to, tz), zonedDateKey(new Date(), tz))
  return { items: rows.map(r => ({ ...r, caption: r.caption.slice(0, 120) })), ...planner }
}

export async function publishAttemptsOf(ctx: WorkspaceContext, targetId: string) {
  assertAbility(ctx, 'posts.read')
  return ctx.db.select({ step: publishAttempts.step, outcome: publishAttempts.outcome, errorCode: publishAttempts.errorCode, createdAt: publishAttempts.createdAt })
    .from(publishAttempts).where(and(eq(publishAttempts.postTargetId, targetId), eq(publishAttempts.workspaceId, ctx.workspaceId))).orderBy(desc(publishAttempts.createdAt)).limit(20)
}
