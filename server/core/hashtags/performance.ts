import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import type { Platform } from '../../../shared/channels/types'
import { extractTags, normalizeTag } from '../../../shared/hashtags/parse'
import type { WorkspaceContext } from '../context'
import { posts, postTargets } from '../db/schema'
import { latestInsights } from '../engagement-jobs'

const WINDOW_DAYS = 90
const MAX_TARGETS = 1000
/** A tag needs this many measured posts before it is called better or worse than usual. */
export const MIN_POSTS = 3
const BETTER = 1.2
const WORSE = 0.8

export type PerformanceLabel = 'better' | 'average' | 'worse' | 'notEnoughData'

export interface TagPerformance {
  posts: number
  ratio: number | null // median views of posts with the tag ÷ the account's median views
  label: PerformanceLabel
}

/** The reach number a platform gives us, most comparable first. Facebook gives none yet. */
function reachOf(metrics: Record<string, number>): number | null {
  for (const key of ['views', 'reach', 'impressions']) {
    if (typeof metrics[key] === 'number') return metrics[key]
  }
  return null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * How each tag did on the creator's own published posts in the last 90 days, compared with what
 * that account usually gets. Uses the numbers the nightly sync already stores; no platform call.
 * Keys are normal-form tags.
 */
export async function tagPerformance(ctx: WorkspaceContext, platforms: Platform[] = []): Promise<Map<string, TagPerformance>> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
  const rows = await ctx.db.select({
    id: postTargets.id,
    socialAccountId: postTargets.socialAccountId,
    // What is live on the platform wins; else what we sent.
    caption: sql<string>`coalesce(${postTargets.platformCaption}, nullif(${postTargets.captionOverride}, ''), ${posts.baseCaption})`,
    firstComment: sql<string | null>`${postTargets.options}->>'firstComment'`
  }).from(postTargets)
    .innerJoin(posts, and(eq(posts.workspaceId, postTargets.workspaceId), eq(posts.id, postTargets.postId)))
    .where(and(
      eq(postTargets.workspaceId, ctx.workspaceId),
      eq(postTargets.status, 'published'),
      gte(postTargets.publishedAt, since),
      isNull(postTargets.removedAt),
      platforms.length ? inArray(postTargets.platform, platforms) : undefined
    ))
    .limit(MAX_TARGETS)
  const insights = await latestInsights(ctx.db, rows.map(r => r.id))

  const measured = rows.flatMap((row) => {
    const metrics = insights.get(row.id)?.metrics
    const value = metrics ? reachOf(metrics) : null
    return value === null ? [] : [{ ...row, value }]
  })
  const perAccount = new Map<string, number[]>()
  for (const row of measured) {
    if (!perAccount.has(row.socialAccountId)) perAccount.set(row.socialAccountId, [])
    perAccount.get(row.socialAccountId)!.push(row.value)
  }
  const baseline = new Map([...perAccount].map(([id, values]) => [id, median(values)]))

  const ratios = new Map<string, number[]>()
  for (const row of measured) {
    const base = baseline.get(row.socialAccountId)
    if (!base) continue // an account whose posts all show 0 views says nothing about tags
    const tags = new Set([...extractTags(row.caption), ...extractTags(row.firstComment ?? '')].map(normalizeTag))
    for (const tag of tags) {
      if (!ratios.has(tag)) ratios.set(tag, [])
      ratios.get(tag)!.push(row.value / base)
    }
  }

  return new Map([...ratios].map(([tag, list]): [string, TagPerformance] => {
    if (list.length < MIN_POSTS) return [tag, { posts: list.length, ratio: null, label: 'notEnoughData' }]
    const ratio = Math.round(median(list) * 100) / 100
    return [tag, { posts: list.length, ratio, label: ratio >= BETTER ? 'better' : ratio <= WORSE ? 'worse' : 'average' }]
  }))
}
