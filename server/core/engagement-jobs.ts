import { and, count, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { PlatformPostState } from './channels/adapter'
import { getAdapter } from './channels/registry'
import { assertAbility, type CoreContext, type WorkspaceContext } from './context'
import type { Database, Executor } from './db/client'
import { insightSnapshots, posts, postTargetChanges, postTargets, socialAccounts, users, workspaceMembers, workspaces } from './db/schema'
import { sendTemplatedEmail } from './email'
import { env } from './env'
import { appError } from './errors'
import { enqueue } from './jobs/enqueue'
import type { JobHandler } from './jobs/types'
import { consumeRateLimit } from './rate-limit'
import { decryptAccount, markNeedsReauth } from './social-accounts'

type Ctx = CoreContext & { db: Database }

const INSIGHTS_WINDOW_DAYS = 30
const INSIGHTS_BATCH = 25
const ACCOUNT_TARGET_CAP = 200

type Account = typeof socialAccounts.$inferSelect
interface SyncTarget { id: string, postId: string, externalId: string | null, workspaceId: string, platformCaption: string | null, removedAt: Date | null }
export interface SyncSummary { accounts: number, snapshots: number, edited: number, removed: number, restored: number, failed: number }
const emptySummary = (): SyncSummary => ({ accounts: 0, snapshots: 0, edited: 0, removed: 0, restored: 0, failed: 0 })

/** Platforms trim and normalise line endings; that alone is not an edit. */
const sameCaption = (a: string, b: string) => a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim()

/**
 * The platform is the source of truth after publishing: an edit there becomes our caption too. A post sent to one
 * account changes the post itself; one sent to several keeps the post and gets its own caption for that account.
 */
async function adoptCaption(tx: Executor, target: SyncTarget, caption: string) {
  const [live] = await tx.select({ n: count() }).from(postTargets).where(and(eq(postTargets.postId, target.postId), ne(postTargets.status, 'cancelled')))
  if ((live?.n ?? 0) <= 1) {
    await tx.update(posts).set({ baseCaption: caption, version: sql`${posts.version} + 1`, updatedAt: new Date() }).where(eq(posts.id, target.postId))
    await tx.update(postTargets).set({ captionOverride: null }).where(eq(postTargets.id, target.id))
  } else {
    await tx.update(postTargets).set({ captionOverride: caption }).where(eq(postTargets.id, target.id))
  }
}

/** Applies one post's platform state: numbers, caption edits, deletion, and its return. Every change is logged. */
async function applyPostState(db: Database, target: SyncTarget, state: PlatformPostState, summary: SyncSummary) {
  const now = new Date()
  const log = (kind: 'caption_changed' | 'removed' | 'restored', before: string | null = null, after: string | null = null) =>
    ({ workspaceId: target.workspaceId, postTargetId: target.id, kind, before, after, detectedAt: now })
  await db.transaction(async (tx) => {
    if ('removed' in state) {
      if (target.removedAt) return
      await tx.update(postTargets).set({ removedAt: now, syncedAt: now, updatedAt: now }).where(eq(postTargets.id, target.id))
      await tx.insert(postTargetChanges).values(log('removed'))
      summary.removed++
      return
    }
    const changes: (typeof postTargetChanges.$inferInsert)[] = []
    const patch: Partial<typeof postTargets.$inferInsert> = { syncedAt: now, updatedAt: now }
    if (target.removedAt) {
      patch.removedAt = null
      changes.push(log('restored'))
      summary.restored++
    }
    if (state.permalink) patch.permalink = state.permalink
    if (state.caption !== null) {
      patch.platformCaption = state.caption
      // A post published before captions were tracked only records its baseline: no edit can be told apart yet.
      if (target.platformCaption !== null && !sameCaption(state.caption, target.platformCaption)) {
        changes.push(log('caption_changed', target.platformCaption, state.caption))
        await adoptCaption(tx, target, state.caption)
        summary.edited++
      }
    }
    await tx.update(postTargets).set(patch).where(eq(postTargets.id, target.id))
    if (changes.length) await tx.insert(postTargetChanges).values(changes)
    if (state.metrics) {
      await tx.insert(insightSnapshots).values({ workspaceId: target.workspaceId, postTargetId: target.id, metrics: state.metrics })
      summary.snapshots++
    }
  })
}

/**
 * Reads one account's published posts from the platform and applies what it says (applyPostState).
 * Account-wide errors (auth, rate limit, outage) are counted, never thrown: one account never stops the others.
 */
async function syncAccountTargets(ctx: Ctx, account: Account, targets: SyncTarget[], summary: SyncSummary) {
  const adapter = getAdapter(account.platform)
  if (!adapter?.fetchPostStates || !targets.length) return
  summary.accounts++
  try {
    const adapterCtx = { account: decryptAccount(account), fetch, log: ctx.log }
    for (let i = 0; i < targets.length; i += INSIGHTS_BATCH) {
      const batch = targets.slice(i, i + INSIGHTS_BATCH)
      const states = new Map((await adapter.fetchPostStates(adapterCtx, batch.map(t => t.externalId!))).map(r => [r.externalId, r]))
      for (const target of batch) {
        const state = states.get(target.externalId!)
        if (state) await applyPostState(ctx.db, target, state, summary)
      }
    }
  } catch (raw) {
    summary.failed++
    const error = adapter.normalizeError(raw)
    if (error.kind === 'auth') await markNeedsReauth(ctx.db, account.id)
    ctx.log.warn('insights.account_failed', { socialAccountId: account.id, kind: error.kind, code: error.code })
  }
}

const targetColumns = { id: postTargets.id, postId: postTargets.postId, externalId: postTargets.externalId, workspaceId: postTargets.workspaceId, platformCaption: postTargets.platformCaption, removedAt: postTargets.removedAt }
const syncable = (accountId: string) => and(eq(postTargets.socialAccountId, accountId), eq(postTargets.status, 'published'), isNotNull(postTargets.externalId))

/**
 * insights.daily, 02:00 WIB (docs/blueprint/15 §3.6): syncs every published post target from the last 30 days with
 * the platform once a day (numbers, caption edits, deletion). Idempotent: a target already synced today is skipped,
 * so a doubled tick or a manual run costs nothing. Posts already found deleted are not asked again (a manual sync
 * re-checks them).
 */
export const insightsDailyJob: JobHandler = async (_job, base) => {
  const ctx = base as Ctx
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const dayStart = new Date(`${today}T00:00:00+07:00`)
  const accounts = await ctx.db.select().from(socialAccounts).where(eq(socialAccounts.status, 'active'))
  const summary = emptySummary()
  for (const account of accounts) {
    const targets = await ctx.db.select(targetColumns).from(postTargets)
      .where(and(
        syncable(account.id), isNull(postTargets.removedAt),
        gte(postTargets.publishedAt, new Date(Date.now() - INSIGHTS_WINDOW_DAYS * 86_400_000)),
        sql`(${postTargets.syncedAt} is null or ${postTargets.syncedAt} < ${dayStart})`
      )).orderBy(desc(postTargets.publishedAt)).limit(ACCOUNT_TARGET_CAP)
    await syncAccountTargets(ctx, account, targets, summary)
  }
  ctx.log.info('insights.daily', { ...summary })
}

/** insights.sync: "Sinkronkan" on the post list. Same as the nightly run for one workspace, without the once-a-day skip. */
export const insightsSyncJob: JobHandler = async (job, base) => {
  const ctx = base as Ctx
  const workspaceId = String(job.payload.workspaceId ?? '')
  const accounts = await ctx.db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.status, 'active')))
  const summary = emptySummary()
  for (const account of accounts) {
    const targets = await ctx.db.select(targetColumns).from(postTargets)
      .where(and(eq(postTargets.workspaceId, workspaceId), syncable(account.id), gte(postTargets.publishedAt, new Date(Date.now() - INSIGHTS_WINDOW_DAYS * 86_400_000))))
      .orderBy(desc(postTargets.publishedAt)).limit(ACCOUNT_TARGET_CAP)
    await syncAccountTargets(ctx, account, targets, summary)
  }
  ctx.log.info('insights.sync', { workspaceId, ...summary })
}

/** "Sinkronkan" on the post list: one background run per workspace, at most once every 5 minutes. */
export async function startWorkspaceSync(ctx: WorkspaceContext): Promise<{ jobId: string | null }> {
  assertAbility(ctx, 'posts.read')
  const limited = await consumeRateLimit(`insights:sync:${ctx.workspaceId}`, 1, 5 * 60_000, ctx.db)
  if (!limited.allowed) throw appError(429, 'Baru saja disinkronkan. Coba lagi beberapa menit lagi.', 'RATE_LIMITED', { retryAfterSeconds: limited.retryAfterSeconds })
  const jobId = await enqueue(ctx.db, 'insights.sync', { workspaceId: ctx.workspaceId }, { singletonKey: `${ctx.workspaceId}:${Date.now()}` })
  return { jobId }
}

/** "Sinkronkan" on a post (any age): re-reads its published targets now, deleted ones included, and reports what changed. */
export async function syncPost(ctx: WorkspaceContext, postId: string): Promise<SyncSummary> {
  assertAbility(ctx, 'posts.read')
  const limited = await consumeRateLimit(`insights:post:${postId}`, 3, 5 * 60_000, ctx.db)
  if (!limited.allowed) throw appError(429, 'Baru saja disinkronkan. Coba lagi beberapa menit lagi.', 'RATE_LIMITED', { retryAfterSeconds: limited.retryAfterSeconds })
  const targets = await ctx.db.select({ ...targetColumns, socialAccountId: postTargets.socialAccountId }).from(postTargets)
    .where(and(eq(postTargets.workspaceId, ctx.workspaceId), eq(postTargets.postId, postId), eq(postTargets.status, 'published'), isNotNull(postTargets.externalId)))
  const summary = emptySummary()
  const accountIds = [...new Set(targets.map(t => t.socialAccountId))]
  const accounts = accountIds.length
    ? await ctx.db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, ctx.workspaceId), inArray(socialAccounts.id, accountIds), eq(socialAccounts.status, 'active')))
    : []
  for (const account of accounts) await syncAccountTargets(ctx as Ctx, account, targets.filter(t => t.socialAccountId === account.id), summary)
  return summary
}

export const INACTIVITY_EMAIL_DAYS = 10

/**
 * engagement.inactivity, 07:00 WIB (docs/blueprint/15 §3.3): owners whose last activity fell on the local day
 * exactly 10 days ago get one win-back email. Stateless: the daily slot claim is the only dedupe needed.
 */
export const inactivityJob: JobHandler = async (_job, base) => {
  const ctx = base as Ctx
  const owners = await ctx.db.select({ email: users.email, name: users.name, workspaceName: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(
      eq(workspaceMembers.role, 'owner'), eq(workspaceMembers.isActive, true), eq(users.isActive, true),
      eq(workspaces.status, 'active'), sql`${workspaces.deletedAt} is null`,
      sql`(coalesce(${users.lastSeenAt}, ${users.lastLoginAt}) at time zone ${workspaces.timezone})::date = (now() at time zone ${workspaces.timezone})::date - ${INACTIVITY_EMAIL_DAYS}::int`
    ))
  for (const owner of owners) {
    ctx.defer(sendTemplatedEmail(ctx, 'inactivity_winback', owner.email, { name: owner.name, workspaceName: owner.workspaceName, days: INACTIVITY_EMAIL_DAYS, appUrl: `${env().siteUrl}/app/compose` }))
  }
  ctx.log.info('engagement.inactivity', { emailed: owners.length })
}

/** Latest snapshot per target (post detail numbers). */
export async function latestInsights(db: Database, targetIds: string[]): Promise<Map<string, { metrics: Record<string, number>, capturedAt: Date }>> {
  if (!targetIds.length) return new Map()
  const rows = await db.selectDistinctOn([insightSnapshots.postTargetId], { postTargetId: insightSnapshots.postTargetId, metrics: insightSnapshots.metrics, capturedAt: insightSnapshots.capturedAt })
    .from(insightSnapshots).where(inArray(insightSnapshots.postTargetId, targetIds)).orderBy(insightSnapshots.postTargetId, desc(insightSnapshots.capturedAt))
  return new Map(rows.map(r => [r.postTargetId, { metrics: r.metrics as Record<string, number>, capturedAt: r.capturedAt }]))
}
