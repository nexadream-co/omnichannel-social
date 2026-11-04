import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { assertAbility, type WorkspaceContext } from './context'
import { dmEvents, linkClicks, postTargets, posts } from './db/schema'

export const momentsQuerySchema = z.object({ since: z.iso.datetime().optional() })

/** Round click numbers stop counting here, so a huge link_clicks table stays cheap. */
const CLICKS_CAP = 10_000
const SINCE_MAX_MS = 30 * 86_400_000

/**
 * What the console celebrates when it opens (GET /api/app/moments). These moments happen in jobs or out in
 * the world (a post goes live, someone clicks, an auto DM goes out), so the browser asks once per visit.
 * With `since`, it also returns the "since your last visit" numbers for the greeting after sign-in.
 */
export async function momentsSummary(ctx: WorkspaceContext, query: z.infer<typeof momentsQuerySchema>) {
  assertAbility(ctx, 'analytics.read')
  const now = new Date()
  const ws = ctx.workspaceId
  const [[first], [clicks], [dm], [upcoming]] = await Promise.all([
    ctx.db.select({ postId: postTargets.postId, platform: postTargets.platform, permalink: postTargets.permalink }).from(postTargets)
      .where(and(eq(postTargets.workspaceId, ws), eq(postTargets.status, 'published'), sql`${postTargets.publishedAt} is not null`))
      .orderBy(asc(postTargets.publishedAt)).limit(1),
    ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from (select 1 from ${linkClicks} where ${linkClicks.workspaceId} = ${ws} and not ${linkClicks.isBot} limit ${CLICKS_CAP}) capped`).then(r => r.rows),
    ctx.db.select({ id: dmEvents.id }).from(dmEvents).where(and(eq(dmEvents.workspaceId, ws), eq(dmEvents.status, 'dm_sent'))).limit(1),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(posts)
      .where(and(eq(posts.workspaceId, ws), eq(posts.status, 'scheduled'), gte(posts.scheduledAt, now), lt(posts.scheduledAt, new Date(now.getTime() + 86_400_000))))
  ])

  let since: { published: number, clicks: number, autoDms: number } | null = null
  if (query.since) {
    const from = new Date(Math.max(new Date(query.since).getTime(), now.getTime() - SINCE_MAX_MS))
    const [[published], [clicked], [dms]] = await Promise.all([
      ctx.db.select({ n: sql<number>`count(*)::int` }).from(postTargets).where(and(eq(postTargets.workspaceId, ws), eq(postTargets.status, 'published'), gte(postTargets.publishedAt, from))),
      ctx.db.select({ n: sql<number>`count(*)::int` }).from(linkClicks).where(and(eq(linkClicks.workspaceId, ws), eq(linkClicks.isBot, false), gte(linkClicks.clickedAt, from))),
      ctx.db.select({ n: sql<number>`count(*)::int` }).from(dmEvents).where(and(eq(dmEvents.workspaceId, ws), eq(dmEvents.status, 'dm_sent'), gte(dmEvents.updatedAt, from)))
    ])
    since = { published: published?.n ?? 0, clicks: clicked?.n ?? 0, autoDms: dms?.n ?? 0 }
  }

  return {
    firstPublished: first ? { postId: first.postId, platform: first.platform, permalink: first.permalink } : null,
    clicksTotal: clicks?.n ?? 0,
    hasAutoDm: Boolean(dm),
    upcoming24h: upcoming?.n ?? 0,
    since
  }
}
