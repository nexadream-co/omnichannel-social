import { and, asc, desc, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { CoreContext, WorkspaceContext } from '../context'
import { newsItems } from '../db/schema'
import type { JobHandler } from '../jobs/types'
import { newsSource, type NewsRegion } from '../services/news'
import { getSettingBool } from '../settings'

/** "Lagi rame" (ARCHITECTURE §8.9): headlines every hour, kept 14 days, free on every plan, rule-based. */
export const NEWS_REGIONS = ['id', 'world'] as const satisfies readonly NewsRegion[]
export const NEWS_RANGES = ['today', 'week'] as const
const KEEP_DAYS = 14
const SHOWN = 8
/** A read within this long after the last one is a doubled tick: it refreshes rank but doesn't count as another hour. */
const SAME_HOUR_MS = 30 * 60_000
/** Still in the top list: seen in the last two hourly reads. */
const CURRENT_MS = 2 * 60 * 60_000

export const newsQuerySchema = z.object({
  region: z.enum(NEWS_REGIONS).default('id'),
  range: z.enum(NEWS_RANGES).default('today')
})

export interface NewsItemView { id: string, title: string, source: string | null, url: string, publishedAt: string | null, firstSeenAt: string, hot: boolean }

/**
 * Reads each region's top list and merges it in; one region failing doesn't stop the other. Returns the headlines
 * stored per region (null = that region failed, or the card is off). Used by news.refresh and `npm run content:sync`.
 */
export async function refreshNews(ctx: CoreContext): Promise<Record<NewsRegion, number | null>> {
  const result: Record<NewsRegion, number | null> = { id: null, world: null }
  if (!await getSettingBool('app.news.enabled', ctx.db)) {
    ctx.log.info('news.refresh.off')
    return result
  }
  const source = newsSource()
  for (const region of NEWS_REGIONS) {
    try {
      const headlines = await source.topHeadlines(region)
      await storeHeadlines(ctx, region, headlines)
      result[region] = headlines.length
      ctx.log.info('news.refresh', { region, count: headlines.length, source: source.name })
    } catch (error) {
      ctx.log.warn('news.refresh.failed', { region, error: (error as Error).message })
    }
  }
  await ctx.db.delete(newsItems).where(lt(newsItems.lastSeenAt, new Date(Date.now() - KEEP_DAYS * 86_400_000)))
  return result
}

/** news.refresh, hourly (job schedule). */
export const newsRefreshJob: JobHandler = async (_job, ctx) => {
  await refreshNews(ctx)
}

export async function storeHeadlines(ctx: Pick<CoreContext, 'db'>, region: NewsRegion, headlines: Awaited<ReturnType<ReturnType<typeof newsSource>['topHeadlines']>>, now = new Date()) {
  if (!headlines.length) return
  const sameHour = new Date(now.getTime() - SAME_HOUR_MS)
  // One statement per read; a doubled or overlapping tick only refreshes the rank.
  await ctx.db.insert(newsItems).values(headlines.map(h => ({
    region, externalId: h.externalId, title: h.title, source: h.source, url: h.url, publishedAt: h.publishedAt,
    firstSeenAt: now, lastSeenAt: now, seenCount: 1, lastRank: h.rank, bestRank: h.rank
  }))).onConflictDoUpdate({
    target: [newsItems.region, newsItems.externalId],
    set: {
      title: sql`excluded.title`,
      source: sql`excluded.source`,
      url: sql`excluded.url`,
      seenCount: sql`${newsItems.seenCount} + (CASE WHEN ${newsItems.lastSeenAt} < ${sameHour.toISOString()} THEN 1 ELSE 0 END)`,
      lastSeenAt: sql`excluded.last_seen_at`,
      lastRank: sql`excluded.last_rank`,
      bestRank: sql`least(${newsItems.bestRank}, excluded.best_rank)`
    }
  })
}

/**
 * Hari ini: stories first seen in the last 24 h, those still in the top list first, by their current rank.
 * Minggu ini: the last 7 days, by how many hours they stayed in the top list, then their best rank.
 */
export async function listNews(ctx: WorkspaceContext, query: z.infer<typeof newsQuerySchema>, now = new Date()): Promise<{ enabled: boolean, items: NewsItemView[] }> {
  if (!await getSettingBool('app.news.enabled', ctx.db)) return { enabled: false, items: [] }
  const current = new Date(now.getTime() - CURRENT_MS)
  const since = new Date(now.getTime() - (query.range === 'today' ? 1 : 7) * 86_400_000)
  const isCurrent = sql<boolean>`${newsItems.lastSeenAt} >= ${current.toISOString()}`
  const rows = await ctx.db.select({
    id: newsItems.id, title: newsItems.title, source: newsItems.source, url: newsItems.url,
    publishedAt: newsItems.publishedAt, firstSeenAt: newsItems.firstSeenAt, hot: isCurrent
  }).from(newsItems)
    .where(and(sql`${newsItems.region} = ${query.region}`, gte(newsItems.firstSeenAt, since)))
    .orderBy(...(query.range === 'today'
      ? [desc(isCurrent), asc(newsItems.lastRank), desc(newsItems.lastSeenAt)]
      : [desc(newsItems.seenCount), asc(newsItems.bestRank), desc(newsItems.firstSeenAt)]))
    .limit(SHOWN)
  return {
    enabled: true,
    items: rows.map(r => ({ ...r, hot: Boolean(r.hot), publishedAt: r.publishedAt?.toISOString() ?? null, firstSeenAt: r.firstSeenAt.toISOString() }))
  }
}
