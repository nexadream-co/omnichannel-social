import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Platform } from '../../../shared/channels/types'
import { extractRawTags, normalizeTag } from '../../../shared/hashtags/parse'
import { checkTags, type TagCheck } from '../../../shared/hashtags/quality'
import { profileCaption, suggestFromLibrary, tagFit } from '../../../shared/hashtags/relevance'
import type { LibraryTag, TagActivity, TagBreadth } from '../../../shared/hashtags/types'
import { getAdapter } from '../channels/registry'
import { assertAbility, type WorkspaceContext } from '../context'
import { sha256 } from '../crypto'
import type { Database, Executor } from '../db/client'
import { hashtagResearchRuns, hashtagSignals, socialAccounts, workspaces } from '../db/schema'
import { countTagResearchThisMonth, getEntitlements } from '../entitlements'
import { appError } from '../errors'
import { enqueue } from '../jobs/enqueue'
import { kick } from '../jobs/runner'
import type { JobHandler } from '../jobs/types'
import { getSettingBool } from '../settings'
import { decryptAccount } from '../social-accounts'
import { loadLibrary } from './library'
import { tagPerformance, type TagPerformance } from './performance'

/** Asking again for the same caption within this window reuses the run and isn't counted again. */
const REUSE_MS = 30 * 60_000
const SIGNAL_TTL_MS = 24 * 3_600_000
/** Threads allows 2,200 searches a day per user; a run looks up at most this many tags. */
const MAX_LOOKUPS = 8
/** A run still pending after this long is shown as ready without the missing numbers (the job died or is stuck). */
const PENDING_GIVE_UP_MS = 2 * 60_000

export const researchSchema = z.object({
  caption: z.string().max(70_000).default(''),
  platforms: z.array(z.enum(['instagram', 'threads', 'facebook'])).max(3).default([]),
  extraTags: z.array(z.string().trim().max(60)).max(30).default([])
})
export type ResearchInput = z.infer<typeof researchSchema>

export type ResearchSource = 'list' | 'history' | 'mine'
/** Why Threads activity is missing, so the UI can say what to do (`ready` = numbers are in). */
export type ThreadsState = 'off' | 'notSelected' | 'noAccount' | 'needsReconnect' | 'pending' | 'ready'

export interface ResearchItem {
  tag: string
  sources: ResearchSource[]
  fit: number
  breadth: TagBreadth | null
  quality: Pick<TagCheck, 'level' | 'codes'>
  performance: TagPerformance | null
  activity: TagActivity | null
}

export interface ResearchResult {
  niche: string | null
  threads: ThreadsState
  items: ResearchItem[]
}

const PERFORMANCE_RANK = { better: 0, average: 1, notEnoughData: 2, worse: 3 } as const
const LEVEL_RANK = { good: 0, warning: 1, error: 2 } as const
const BREADTH_RANK = { specific: 0, niche: 1, broad: 2 } as const

function rank(a: ResearchItem, b: ResearchItem): number {
  return LEVEL_RANK[a.quality.level] - LEVEL_RANK[b.quality.level]
    || (PERFORMANCE_RANK[a.performance?.label ?? 'notEnoughData'] - PERFORMANCE_RANK[b.performance?.label ?? 'notEnoughData'])
    || b.fit - a.fit
    || BREADTH_RANK[a.breadth ?? 'niche'] - BREADTH_RANK[b.breadth ?? 'niche']
    || a.tag.localeCompare(b.tag)
}

/** Candidates from the tag list, the creator's own history and their own input, each with fit, quality and history. */
function buildItems(input: ResearchInput, library: readonly LibraryTag[], performance: Map<string, TagPerformance>): Omit<ResearchResult, 'threads'> {
  const profile = profileCaption(input.caption, library)
  const byTag = new Map(library.map(entry => [entry.tag, entry]))
  const items = new Map<string, ResearchItem>()
  const add = (tag: string, source: ResearchSource) => {
    const key = normalizeTag(tag)
    if (!key) return
    const existing = items.get(key)
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source)
      return
    }
    const check = checkTags({ tags: [tag], caption: input.caption, platforms: input.platforms, library }).tags[0]!
    items.set(key, {
      tag: tag.replace(/^#+/, ''),
      sources: [source],
      fit: tagFit(key, profile, library).score,
      breadth: byTag.get(key)?.breadth ?? null,
      // Limits are about the whole caption, not one candidate.
      quality: { level: check.codes.some(code => code !== 'overLimit') ? check.level : 'good', codes: check.codes.filter(code => code !== 'overLimit') },
      performance: performance.get(key) ?? null,
      activity: null
    })
  }
  for (const tag of [...extractRawTags(input.caption), ...input.extraTags]) add(tag, 'mine')
  for (const suggestion of suggestFromLibrary(input.caption, library, { platforms: input.platforms, limit: 15 })) add(suggestion.tag, 'list')
  // Tags that did well before and fit this caption.
  const fromHistory = [...performance.entries()]
    .filter(([tag, stats]) => stats.label !== 'worse' && tagFit(tag, profile, library).score > 0 && byTag.get(tag)?.status !== 'blocked')
    .sort((a, b) => (b[1].ratio ?? 0) - (a[1].ratio ?? 0) || b[1].posts - a[1].posts)
    .slice(0, 10)
  for (const [tag] of fromHistory) add(tag, 'history')
  return { niche: profile.niche, items: [...items.values()].sort(rank) }
}

async function threadsAccount(db: Executor, workspaceId: string) {
  const accounts = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.platform, 'threads'), eq(socialAccounts.status, 'active')))
  const search = getAdapter('threads')?.tagSearch
  return { any: accounts.length > 0, usable: search ? accounts.find(a => search.allowed(a.scopes)) ?? null : null }
}

async function freshSignals(db: Executor, platform: Platform, tags: string[]): Promise<Map<string, TagActivity>> {
  if (!tags.length) return new Map()
  const rows = await db.select().from(hashtagSignals)
    .where(and(eq(hashtagSignals.platform, platform), inArray(hashtagSignals.tag, tags), gt(hashtagSignals.fetchedAt, new Date(Date.now() - SIGNAL_TTL_MS))))
  return new Map(rows.map(row => [row.tag, row.data as TagActivity]))
}

async function usage(ctx: WorkspaceContext) {
  const [ws] = await ctx.db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
  const [{ limits }, used] = await Promise.all([
    getEntitlements(ctx.workspaceId, undefined, ctx.db),
    countTagResearchThisMonth(ctx.db, ctx.workspaceId, ws?.timezone ?? 'Asia/Jakarta')
  ])
  return { used, limit: limits.tagResearchPerMonth }
}

function toView(run: typeof hashtagResearchRuns.$inferSelect, usageNow: { used: number, limit: number }) {
  const result = run.result as ResearchResult
  const stuck = run.status === 'pending' && Date.now() - run.createdAt.getTime() > PENDING_GIVE_UP_MS
  return {
    runId: run.id,
    status: stuck ? 'ready' : run.status,
    niche: result.niche,
    threads: stuck ? 'ready' : result.threads,
    items: result.items,
    usage: usageNow
  }
}

/**
 * "Riset": paid, one use per caption per 30 minutes. Everything except Threads activity is computed
 * here from our own data; Threads numbers come from a background job the composer polls for.
 */
export async function researchTags(ctx: WorkspaceContext, input: ResearchInput) {
  assertAbility(ctx, 'posts.write')
  const platforms = [...new Set(input.platforms)].sort()
  const captionHash = sha256(JSON.stringify({ caption: input.caption.trim(), platforms, extra: input.extraTags.map(normalizeTag).sort() }))
  const [recent] = await ctx.db.select().from(hashtagResearchRuns)
    .where(and(eq(hashtagResearchRuns.workspaceId, ctx.workspaceId), eq(hashtagResearchRuns.captionHash, captionHash), gt(hashtagResearchRuns.createdAt, new Date(Date.now() - REUSE_MS))))
    .orderBy(desc(hashtagResearchRuns.createdAt)).limit(1)
  if (recent) return toView(recent, await usage(ctx))

  const before = await usage(ctx)
  if (before.limit === 0) throw appError(402, 'Riset tagar belum termasuk di paket kamu. Upgrade untuk membukanya. Cek kualitas tagar tetap gratis.', 'PLAN_REQUIRED', { limit: 'tagResearchPerMonth' })
  if (before.limit !== -1 && before.used >= before.limit) {
    throw appError(402, `Jatah riset tagar bulan ini sudah habis (${before.limit}). Upgrade untuk menambah, atau pakai cek kualitas yang gratis.`, 'LIMIT_REACHED', { limit: 'tagResearchPerMonth', max: before.limit, current: before.used })
  }

  const [library, performance] = await Promise.all([loadLibrary(ctx.db), tagPerformance(ctx, platforms)])
  const built = buildItems({ ...input, platforms }, library, performance)

  let threads: ThreadsState = 'notSelected'
  let lookup: { accountId: string, tags: string[] } | null = null
  if (platforms.includes('threads')) {
    if (!await getSettingBool('channels.hashtags.threadsSearchEnabled', ctx.db)) {
      threads = 'off'
    } else {
      const account = await threadsAccount(ctx.db, ctx.workspaceId)
      if (!account.usable) {
        threads = account.any ? 'needsReconnect' : 'noAccount'
      } else {
        const keys = built.items.filter(item => item.quality.level !== 'error').slice(0, MAX_LOOKUPS).map(item => normalizeTag(item.tag))
        const cached = await freshSignals(ctx.db, 'threads', keys)
        for (const item of built.items) item.activity = cached.get(normalizeTag(item.tag)) ?? null
        const missing = keys.filter(key => !cached.has(key))
        threads = missing.length ? 'pending' : 'ready'
        if (missing.length) lookup = { accountId: account.usable.id, tags: missing }
      }
    }
  }

  const result: ResearchResult = { ...built, threads }
  const { run, jobId } = await ctx.db.transaction(async (tx) => {
    // One research at a time per workspace, so two quick taps can't both pass the monthly limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`hashtags:research:${ctx.workspaceId}`}))`)
    const [ws] = await tx.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
    const used = await countTagResearchThisMonth(tx, ctx.workspaceId, ws?.timezone ?? 'Asia/Jakarta')
    if (before.limit !== -1 && used >= before.limit) throw appError(402, `Jatah riset tagar bulan ini sudah habis (${before.limit}).`, 'LIMIT_REACHED', { limit: 'tagResearchPerMonth', max: before.limit, current: used })
    const [row] = await tx.insert(hashtagResearchRuns).values({
      workspaceId: ctx.workspaceId, userId: ctx.userId ?? 'system', captionHash, platforms, status: lookup ? 'pending' : 'ready', result
    }).returning()
    const id = lookup ? await enqueue(tx, 'hashtags.signals', { workspaceId: ctx.workspaceId, runId: row!.id, ...lookup }) : null
    return { run: row!, jobId: id }
  })
  if (jobId) ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  return toView(run, { used: before.used + 1, limit: before.limit })
}

export async function getResearchRun(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'posts.write')
  const [run] = await ctx.db.select().from(hashtagResearchRuns).where(and(eq(hashtagResearchRuns.id, id), eq(hashtagResearchRuns.workspaceId, ctx.workspaceId))).limit(1)
  if (!run) throw appError(404, 'Hasil riset tidak ditemukan. Coba riset lagi.', 'NOT_FOUND')
  return toView(run, await usage(ctx))
}

/**
 * hashtags.signals: looks up Threads activity for a run's tags, caches it for every workspace
 * (public numbers only) and marks the run ready. A failed lookup leaves that tag without numbers;
 * it never fails the run, and never marks the account for reconnect.
 */
export const hashtagSignalsJob: JobHandler = async (job, ctx) => {
  const payload = job.payload as { workspaceId: string, runId: string, accountId: string, tags: string[] }
  const found = new Map<string, TagActivity>()
  const [account] = await ctx.db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.id, payload.accountId), eq(socialAccounts.workspaceId, payload.workspaceId), eq(socialAccounts.status, 'active'))).limit(1)
  const adapter = getAdapter('threads')
  if (account && adapter?.tagSearch?.allowed(account.scopes)) {
    const adapterCtx = { account: decryptAccount(account), fetch, log: ctx.log }
    for (const tag of payload.tags.slice(0, MAX_LOOKUPS)) {
      try {
        const activity = await adapter.tagSearch.activity(adapterCtx, tag)
        found.set(tag, activity)
        await ctx.db.insert(hashtagSignals).values({ platform: 'threads', tag, data: activity, fetchedAt: new Date() })
          .onConflictDoUpdate({ target: [hashtagSignals.platform, hashtagSignals.tag], set: { data: activity, fetchedAt: new Date() } })
      } catch (error) {
        const detail = adapter.normalizeError(error)
        ctx.log.warn('hashtags.signal_failed', { tag, kind: detail.kind, code: detail.code })
        if (detail.kind !== 'validation' && detail.kind !== 'permanent') break // auth, rate limit, outage: stop this run
      }
    }
  }
  await ctx.db.transaction(async (tx) => {
    const [run] = await tx.select().from(hashtagResearchRuns)
      .where(and(eq(hashtagResearchRuns.id, payload.runId), eq(hashtagResearchRuns.workspaceId, payload.workspaceId))).for('update')
    if (!run) return
    const result = run.result as ResearchResult
    for (const item of result.items) item.activity = found.get(normalizeTag(item.tag)) ?? item.activity
    await tx.update(hashtagResearchRuns).set({ status: 'ready', result: { ...result, threads: 'ready' }, updatedAt: new Date() }).where(eq(hashtagResearchRuns.id, run.id))
  })
}
