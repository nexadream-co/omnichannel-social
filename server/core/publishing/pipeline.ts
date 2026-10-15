import { and, asc, count, eq, gte, min, sql } from 'drizzle-orm'
import { CHANNELS, PLATFORM_META } from '../../../shared/channels/registry'
import type { AdapterError, ResolvedTarget } from '../channels/adapter'
import { getAdapter } from '../channels/registry'
import type { CoreContext } from '../context'
import type { Database } from '../db/client'
import { mediaAssets, platformPublishLedger, postMedia, posts, postTargets, publishAttempts, socialAccounts, workspaces } from '../db/schema'
import { enqueue } from '../jobs/enqueue'
import type { ClaimedJob, JobHandler, JobResult } from '../jobs/types'
import { notifyWorkspaceOwners } from '../notifications'
import { getSettingBool } from '../settings'
import { decryptAccount, markNeedsReauth } from '../social-accounts'
import { refreshPostStatus } from './status'

type Target = typeof postTargets.$inferSelect
type Account = typeof socialAccounts.$inferSelect

const KILL_SWITCH_DEFER_MS = 10 * 60_000
const POLL_MAX_MS = 20 * 60_000
const RECONCILE_ROUNDS = 3
let inlinePollDelays = [5_000, 10_000]

/** Tests only: skip the real waits between inline container checks. */
export function setInlinePollDelays(delays: number[]) {
  inlinePollDelays = delays
}

/** Plain Bahasa reasons for notifications and emails (the console renders its own i18n copy from the code). */
const REASON_COPY: Record<string, string> = {
  auth: 'Akun perlu dihubungkan ulang.',
  rate_limit: 'Platform sedang membatasi postingan. Kami coba lagi otomatis.',
  quota: 'Batas harian platform tercapai. Kami jadwalkan ulang otomatis.',
  validation: 'Postingan tidak diterima platform. Periksa media dan caption, lalu coba lagi.',
  permanent: 'Platform menolak postingan ini. Coba ubah isinya lalu jadwalkan lagi.',
  transient: 'Platform sedang bermasalah. Coba lagi sebentar lagi.',
  not_found_after_publish: 'Kami tidak bisa memastikan postingan terbit. Cek akunmu; jika belum ada, coba lagi.',
  container_timeout: 'Platform terlalu lama memproses video. Coba lagi.',
  media_not_ready: 'Media belum siap.'
}

const dateFormat = (tz: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz })
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 120).toLowerCase()
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function recordAttempt(db: Database, target: Target, step: string, outcome: string, startedAt: number, error?: AdapterError) {
  await db.insert(publishAttempts).values({
    workspaceId: target.workspaceId, postTargetId: target.id, attemptNo: target.attemptCount, step, outcome,
    errorCode: error?.code ?? (error ? error.kind : null), errorSubcode: error?.subcode ?? null, fbtraceId: error?.fbtraceId ?? null,
    response: error ? { kind: error.kind, message: error.message.slice(0, 500) } : null,
    durationMs: Date.now() - startedAt
  })
}

async function setTarget(db: Database, id: string, values: Partial<typeof postTargets.$inferInsert>) {
  await db.update(postTargets).set({ ...values, updatedAt: new Date() }).where(eq(postTargets.id, id))
}

async function notifyFailure(ctx: CoreContext, target: Target, account: Account, code: string) {
  const [ws] = await ctx.db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, target.workspaceId))
  await notifyWorkspaceOwners(ctx, target.workspaceId, {
    templateKey: 'post_failed',
    dedupeKey: `post_failed:${target.id}`,
    variables: {
      platformLabel: PLATFORM_META[target.platform].name,
      accountName: account.username ?? '',
      scheduledAt: target.scheduledAt ? dateFormat(ws?.timezone ?? 'Asia/Jakarta').format(target.scheduledAt) : '',
      reason: REASON_COPY[code] ?? REASON_COPY.permanent,
      postUrl: `/app/posts/${target.postId}`
    }
  }, { includeEditors: true })
}

async function fail(ctx: CoreContext, target: Target, account: Account, code: string, message?: string) {
  const db = ctx.db as Database
  await setTarget(db, target.id, { status: 'failed', lastErrorCode: code, lastErrorMsg: message?.slice(0, 500) ?? null })
  await refreshPostStatus(db, target.postId)
  await notifyFailure(ctx, target, account, code)
}

/** Error routing by AdapterError.kind (ARCHITECTURE §8.4). Returns a defer for the runner, or nothing. */
async function routeError(ctx: CoreContext, job: ClaimedJob, target: Target, account: Account, error: AdapterError, step: 'prepare' | 'poll'): Promise<JobResult> {
  const db = ctx.db as Database
  switch (error.kind) {
    case 'auth':
      await markNeedsReauth(db, account.id)
      await setTarget(db, target.id, { status: 'needs_reauth', lastErrorCode: 'auth', step: null, containerIds: [] })
      await refreshPostStatus(db, target.postId)
      await notifyWorkspaceOwners(ctx, target.workspaceId, {
        templateKey: 'account_reconnect_needed',
        dedupeKey: `account_reconnect_needed:${account.id}:${new Date().toISOString().slice(0, 10)}`,
        variables: { platformLabel: PLATFORM_META[account.platform].name, accountName: account.username ?? '', reconnectUrl: '/app/accounts' }
      })
      return
    case 'rate_limit':
    case 'quota': {
      const until = error.retryAfter ?? new Date(Date.now() + 3_600_000)
      await setTarget(db, target.id, { status: 'quota_deferred', lastErrorCode: error.kind, step: null, containerIds: [] })
      await refreshPostStatus(db, target.postId)
      return { deferUntil: until }
    }
    case 'transient':
      if (job.attempts >= job.maxAttempts) return fail(ctx, target, account, 'transient', error.message)
      await setTarget(db, target.id, { status: 'retrying', lastErrorCode: 'transient', lastErrorMsg: error.message.slice(0, 500), ...(step === 'prepare' ? { step: null, containerIds: [] } : {}) })
      throw new Error(`transient: ${error.message}`) // the runner retries with backoff
    default:
      return fail(ctx, target, account, error.kind, error.message)
  }
}

/** The publish payload: caption override, ordered public media URLs, per-target options. */
async function resolveTarget(db: Database, target: Target): Promise<ResolvedTarget | null> {
  const [post] = await db.select({ caption: posts.baseCaption }).from(posts).where(eq(posts.id, target.postId))
  const media = await db.select({ url: mediaAssets.publicUrl, kind: mediaAssets.kind, status: mediaAssets.status }).from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId)).where(eq(postMedia.postId, target.postId)).orderBy(asc(postMedia.position))
  if (media.some(m => m.status !== 'ready' || !m.url)) return null
  const caption = target.captionOverride?.trim() ? target.captionOverride : post?.caption ?? ''
  const options = target.options as { firstComment?: string, altText?: string }
  return {
    format: target.format,
    caption,
    media: media.map(m => ({ url: m.url!, kind: m.kind })),
    options: { ...options, linkAttachment: target.platform === 'threads' && target.format === 'text' ? caption.match(/https?:\/\/\S+/)?.[0] : undefined }
  }
}

function adapterCtx(ctx: CoreContext, account: Account) {
  return { account: decryptAccount(account), fetch, log: ctx.log }
}

/** Local rolling-24h count first; near the limit, ask the platform (ARCHITECTURE §8.3). */
async function quotaDeferral(ctx: CoreContext, account: Account): Promise<Date | null> {
  const db = ctx.db as Database
  const limit = CHANNELS[account.platform].dailyPublishLimit
  if (!limit) return null
  const since = new Date(Date.now() - 86_400_000)
  const [row] = await db.select({ n: count(), oldest: min(platformPublishLedger.publishedAt) }).from(platformPublishLedger)
    .where(and(eq(platformPublishLedger.socialAccountId, account.id), gte(platformPublishLedger.publishedAt, since)))
  let used = row?.n ?? 0
  if (used >= limit - 5) {
    const adapter = getAdapter(account.platform)
    const remote = await adapter?.getQuota?.(adapterCtx(ctx, account)).catch(() => null)
    if (remote) used = Math.max(used, remote.used)
  }
  if (used < limit) return null
  return row?.oldest ? new Date(row.oldest.getTime() + 86_400_000 + 60_000) : new Date(Date.now() + 3_600_000)
}

async function publishStep(ctx: CoreContext, job: ClaimedJob, target: Target, account: Account, resolved: ResolvedTarget, containerIds: string[]): Promise<JobResult> {
  const db = ctx.db as Database
  const adapter = getAdapter(account.platform)!
  // Persist BEFORE calling media_publish: if we die mid-call, the next run reconciles instead of re-posting.
  await setTarget(db, target.id, { status: 'publishing', step: 'publishing', containerIds })
  const started = Date.now()
  try {
    const result = await adapter.publish(adapterCtx(ctx, account), resolved, containerIds)
    await db.transaction(async (tx) => {
      await tx.update(postTargets).set({ status: 'published', step: 'done', externalId: result.externalId, permalink: result.permalink ?? null, publishedAt: new Date(), lastErrorCode: null, lastErrorMsg: null, updatedAt: new Date() }).where(eq(postTargets.id, target.id))
      await tx.insert(platformPublishLedger).values({ workspaceId: target.workspaceId, socialAccountId: account.id })
    })
    await recordAttempt(db, target, 'publish', 'published', started)
    await refreshPostStatus(db, target.postId)
  } catch (raw) {
    const error = adapter.normalizeError(raw)
    await recordAttempt(db, target, 'publish', error.kind === 'transient' ? 'unknown' : 'error', started, error)
    if (error.kind === 'transient') {
      // We can't tell whether it went out. Never blindly retry media_publish (CLAUDE.md rule 10).
      await setTarget(db, target.id, { status: 'publish_unknown', lastErrorCode: 'transient' })
      await enqueue(db, 'publish.reconcile', { targetId: target.id, workspaceId: target.workspaceId, version: job.payload.version, round: 1 }, { runAt: new Date(Date.now() + 60_000), singletonKey: `${target.id}:reconcile:1` })
      await refreshPostStatus(db, target.postId)
      return
    }
    // A definite error from the platform means nothing went out: clear the step so a retry starts fresh.
    await setTarget(db, target.id, { step: null, containerIds: [] })
    return routeError(ctx, job, { ...target, step: null }, account, error, 'prepare')
  }
}

/** Load + re-check everything; the job is only a trigger (docs/blueprint/15 §1 rule 2). */
async function loadLive(db: Database, job: ClaimedJob, allowed: string[]) {
  const [row] = await db.select({ target: postTargets, account: socialAccounts, version: posts.version, workspaceStatus: workspaces.status, deletedAt: workspaces.deletedAt })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, postTargets.socialAccountId))
    .innerJoin(workspaces, eq(workspaces.id, postTargets.workspaceId))
    .where(eq(postTargets.id, String(job.payload.targetId))).limit(1)
  if (!row) return null
  if (job.payload.version !== undefined && Number(job.payload.version) !== row.version) return null // stale: the post was rescheduled
  if (!allowed.includes(row.target.status)) return null
  if (row.workspaceStatus !== 'active' || row.deletedAt) return null // suspended: the target waits; reinstate decides
  return row
}

/** publish.target: lock, drop stale jobs, quota, prepare, then publish or hand over to polling. */
export const publishTargetJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  if (await getSettingBool('channels.publishing.paused', db)) return { deferUntil: new Date(Date.now() + KILL_SWITCH_DEFER_MS) }
  type Live = NonNullable<Awaited<ReturnType<typeof loadLive>>>
  type Claim = null | { kind: 'early', at: Date } | { kind: 'done', postId: string } | { kind: 'go', live: Live } | { kind: 'resume', live: Live }
  const claimed: Claim = await db.transaction(async (tx): Promise<Claim> => {
    const locked = await tx.execute<{ id: string }>(sql`select id from post_targets where id = ${String(job.payload.targetId)} for update skip locked`)
    if (!locked.rows.length) return null // another run holds it
    // preparing/processing/publishing here mean an earlier run of this job died mid-step (lease expired).
    const live = await loadLive(tx as unknown as Database, job, ['scheduled', 'retrying', 'quota_deferred', 'preparing', 'processing', 'publishing'])
    if (!live) return null
    if (live.target.status === 'publishing') {
      // The result of media_publish is unknown: reconcile, never re-publish.
      await tx.update(postTargets).set({ status: 'publish_unknown', updatedAt: new Date() }).where(eq(postTargets.id, live.target.id))
      await enqueue(tx, 'publish.reconcile', { targetId: live.target.id, workspaceId: live.target.workspaceId, version: job.payload.version, round: 1 }, { singletonKey: `${live.target.id}:reconcile:recover:${live.target.attemptCount}` })
      return { kind: 'done', postId: live.target.postId }
    }
    if (live.target.status === 'processing' && live.target.containerIds.length) return { kind: 'resume', live }
    if (live.target.scheduledAt && live.target.scheduledAt.getTime() > Date.now() + 60_000) return { kind: 'early', at: live.target.scheduledAt }
    if (live.account.status !== 'active') {
      await tx.update(postTargets).set({ status: live.account.status === 'needs_reauth' ? 'needs_reauth' : 'draft', updatedAt: new Date() }).where(eq(postTargets.id, live.target.id))
      return { kind: 'done', postId: live.target.postId }
    }
    await tx.update(postTargets).set({ status: 'preparing', step: 'prepare', attemptCount: sql`${postTargets.attemptCount} + 1`, updatedAt: new Date() }).where(eq(postTargets.id, live.target.id))
    return { kind: 'go', live: { ...live, target: { ...live.target, attemptCount: live.target.attemptCount + 1 } } }
  })
  if (!claimed) return
  if (claimed.kind === 'early') return { deferUntil: claimed.at }
  if (claimed.kind === 'done') return refreshPostStatus(db, claimed.postId)
  const { target, account } = claimed.live
  await refreshPostStatus(db, target.postId)
  if (claimed.kind === 'resume') {
    await enqueue(db, 'publish.poll', { targetId: target.id, workspaceId: target.workspaceId, version: job.payload.version, startedAt: Date.now(), round: 1 }, { singletonKey: `${target.id}:poll:${target.attemptCount}:resume` })
    return
  }

  const deferral = await quotaDeferral(ctx, account)
  if (deferral) {
    await setTarget(db, target.id, { status: 'quota_deferred', step: null, lastErrorCode: 'quota' })
    await refreshPostStatus(db, target.postId)
    await notifyWorkspaceOwners(ctx, target.workspaceId, {
      templateKey: 'quota_deferred', dedupeKey: `quota_deferred:${account.id}:${new Date().toISOString().slice(0, 10)}`,
      variables: { platformLabel: PLATFORM_META[account.platform].name, accountName: account.username ?? '', count: 1, nextSlot: dateFormat('Asia/Jakarta').format(deferral) }
    }, { includeEditors: true })
    return { deferUntil: deferral }
  }

  const resolved = await resolveTarget(db, target)
  if (!resolved) return fail(ctx, target, account, 'media_not_ready')
  const adapter = getAdapter(account.platform)
  if (!adapter) return fail(ctx, target, account, 'permanent', 'Platform not available')

  const started = Date.now()
  let prepared: Awaited<ReturnType<typeof adapter.prepare>>
  try {
    prepared = await adapter.prepare(adapterCtx(ctx, account), resolved)
    await recordAttempt(db, target, 'prepare', 'ok', started)
  } catch (raw) {
    const error = adapter.normalizeError(raw)
    await recordAttempt(db, target, 'prepare', 'error', started, error)
    return routeError(ctx, job, target, account, error, 'prepare')
  }
  if ('ready' in prepared) return publishStep(ctx, job, target, account, resolved, [])

  const containerIds = prepared.containerIds
  await setTarget(db, target.id, { status: 'processing', step: 'processing', containerIds })
  // Containers often finish in seconds: check inline twice before handing over to the poll job.
  for (const wait of inlinePollDelays) {
    await sleep(wait)
    const status = await adapter.checkStatus(adapterCtx(ctx, account), containerIds).catch(raw => adapter.normalizeError(raw))
    if (status === 'ready') return publishStep(ctx, job, target, account, resolved, containerIds)
    if (status !== 'pending') return routeError(ctx, job, target, account, status, 'poll')
  }
  await enqueue(db, 'publish.poll', { targetId: target.id, workspaceId: target.workspaceId, version: job.payload.version, startedAt: Date.now(), round: 1 }, { runAt: new Date(Date.now() + 30_000), singletonKey: `${target.id}:poll:${target.attemptCount}:1` })
}

/** publish.poll: container status with backoff (30 s → 60 s), max 20 minutes (Reels). */
export const publishPollJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const live = await loadLive(db, job, ['processing', 'publishing'])
  if (!live) return
  const { target, account } = live
  if (target.status === 'publishing') {
    // An earlier run of this poll died inside media_publish: reconcile, never re-publish.
    await setTarget(db, target.id, { status: 'publish_unknown' })
    await enqueue(db, 'publish.reconcile', { targetId: target.id, workspaceId: target.workspaceId, version: job.payload.version, round: 1 }, { singletonKey: `${target.id}:reconcile:recover:${target.attemptCount}` })
    return refreshPostStatus(db, target.postId)
  }
  const adapter = getAdapter(account.platform)!
  const resolved = await resolveTarget(db, target)
  if (!resolved) return fail(ctx, target, account, 'media_not_ready')
  const status = await adapter.checkStatus(adapterCtx(ctx, account), target.containerIds).catch(raw => adapter.normalizeError(raw))
  if (status === 'ready') return publishStep(ctx, job, target, account, resolved, target.containerIds)
  if (status !== 'pending') return routeError(ctx, job, target, account, status, 'poll')
  if (Date.now() - Number(job.payload.startedAt) > POLL_MAX_MS) return fail(ctx, target, account, 'container_timeout')
  const round = Number(job.payload.round ?? 1) + 1
  await enqueue(db, 'publish.poll', { ...job.payload, round }, { runAt: new Date(Date.now() + (round < 4 ? 30_000 : 60_000)), singletonKey: `${target.id}:poll:${target.attemptCount}:${round}` })
}

/** publish.reconcile: find the post by caption (or time, for caption-less Stories). Never a blind re-publish. */
export const publishReconcileJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const live = await loadLive(db, job, ['publish_unknown'])
  if (!live) return
  const { target, account } = live
  const adapter = getAdapter(account.platform)!
  const resolved = await resolveTarget(db, target)
  const since = new Date((target.scheduledAt ?? target.updatedAt).getTime() - 10 * 60_000)
  const started = Date.now()
  let recent: Awaited<ReturnType<typeof adapter.findRecent>>
  try {
    recent = await adapter.findRecent(adapterCtx(ctx, account), since)
  } catch (raw) {
    const error = adapter.normalizeError(raw)
    if (error.kind === 'auth') return routeError(ctx, job, target, account, error, 'poll')
    throw raw // transient: the runner retries the reconcile itself
  }
  const wanted = normalize(resolved?.caption ?? '')
  const match = wanted
    ? recent.find(r => normalize(r.caption) === wanted)
    : recent.find(r => r.ts.getTime() >= target.updatedAt.getTime() - 5 * 60_000)
  if (match) {
    await db.transaction(async (tx) => {
      await tx.update(postTargets).set({ status: 'published', step: 'done', externalId: match.externalId, permalink: match.permalink ?? null, publishedAt: match.ts, lastErrorCode: null, updatedAt: new Date() }).where(eq(postTargets.id, target.id))
      await tx.insert(platformPublishLedger).values({ workspaceId: target.workspaceId, socialAccountId: account.id, publishedAt: match.ts })
    })
    await recordAttempt(db, target, 'reconcile', 'found', started)
    await refreshPostStatus(db, target.postId)
    return
  }
  await recordAttempt(db, target, 'reconcile', 'not_found', started)
  const round = Number(job.payload.round ?? 1)
  if (round < RECONCILE_ROUNDS) {
    await enqueue(db, 'publish.reconcile', { ...job.payload, round: round + 1 }, { runAt: new Date(Date.now() + 2 * 60_000), singletonKey: `${target.id}:reconcile:${round + 1}` })
    return
  }
  await fail(ctx, target, account, 'not_found_after_publish')
}
