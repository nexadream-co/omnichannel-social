import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { assertAbility, type WorkspaceContext } from '../context'
import { linkClicks, links, posts, postTargets, shortLinks, workspaces } from '../db/schema'
import { getEntitlements } from '../entitlements'
import { appError } from '../errors'

export const analyticsQuerySchema = z.object({ days: z.coerce.number().int().refine(v => [7, 30, 90].includes(v)).default(7) })

/**
 * Reads clamp, never refuse (docs/blueprint/06 §5): a window longer than the plan's click history
 * is shortened, and the response says so.
 */
async function resolveWindow(ctx: WorkspaceContext, days: number) {
  const { limits } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  const allowed = limits.clickRetentionDays === -1 ? days : Math.min(days, limits.clickRetentionDays)
  const [ws] = await ctx.db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
  const tz = ws?.timezone ?? 'Asia/Jakarta'
  // Whole local days: the window starts at midnight in the workspace's timezone, so totals equal the sum of the bars.
  const [bounds] = await ctx.db.execute<{ from: string, today: string }>(sql`select to_char(((date_trunc('day', now() at time zone ${tz}) - make_interval(days => ${allowed - 1})) at time zone ${tz}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "from", to_char(now() at time zone ${tz}, 'YYYY-MM-DD') as today`).then(r => r.rows)
  const to = new Date()
  const from = new Date(bounds!.from)
  const today = bounds!.today
  return { from, to, days: allowed, requestedDays: days, clamped: allowed < days, tz, today }
}

const human = (ctx: WorkspaceContext, from: Date, to: Date) => and(eq(linkClicks.workspaceId, ctx.workspaceId), eq(linkClicks.isBot, false), gte(linkClicks.clickedAt, from), lt(linkClicks.clickedAt, to))

export async function workspaceAnalytics(ctx: WorkspaceContext, query: z.infer<typeof analyticsQuerySchema>) {
  assertAbility(ctx, 'analytics.read')
  const window = await resolveWindow(ctx, query.days)
  const where = human(ctx, window.from, window.to)
  const day = sql<string>`to_char(${linkClicks.clickedAt} at time zone ${window.tz}, 'YYYY-MM-DD')`
  const [[totals], daily, topLinks, bySource, byChannel, topPosts, devices, cities] = await Promise.all([
    ctx.db.select({ clicks: sql<number>`count(*)::int`, uniques: sql<number>`count(*) filter (where ${linkClicks.isUniqueDay})::int` }).from(linkClicks).where(where),
    ctx.db.select({ day, clicks: sql<number>`count(*)::int` }).from(linkClicks).where(where).groupBy(sql`1`).orderBy(sql`1`),
    ctx.db.select({ linkId: links.id, title: links.title, merchant: links.merchant, imageUrl: links.imageUrl, clicks: sql<number>`count(*)::int` })
      .from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).innerJoin(links, eq(links.id, shortLinks.linkId))
      .where(where).groupBy(links.id).orderBy(desc(sql`count(*)`)).limit(5),
    ctx.db.select({ source: shortLinks.source, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where).groupBy(shortLinks.source),
    ctx.db.select({ channel: sql<string>`coalesce(${shortLinks.channel}, 'other')`, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where).groupBy(sql`1`),
    ctx.db.select({ postId: posts.id, caption: posts.baseCaption, platform: postTargets.platform, clicks: sql<number>`count(*)::int` })
      .from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).innerJoin(postTargets, eq(postTargets.id, shortLinks.postTargetId)).innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(where).groupBy(posts.id, postTargets.platform).orderBy(desc(sql`count(*)`)).limit(5),
    ctx.db.select({ device: sql<string>`coalesce(${linkClicks.device}, 'other')`, clicks: sql<number>`count(*)::int` }).from(linkClicks).where(where).groupBy(sql`1`),
    ctx.db.select({ city: linkClicks.city, clicks: sql<number>`count(*)::int` }).from(linkClicks).where(and(where, sql`${linkClicks.city} is not null`)).groupBy(linkClicks.city).orderBy(desc(sql`count(*)`)).limit(5)
  ])
  return {
    window: { days: window.days, requestedDays: window.requestedDays, clamped: window.clamped, today: window.today },
    totals: totals ?? { clicks: 0, uniques: 0 },
    daily, topLinks, bySource, byChannel, topPosts: topPosts.map(p => ({ ...p, caption: p.caption.slice(0, 100) })), devices, cities
  }
}

export async function linkAnalytics(ctx: WorkspaceContext, linkId: string, query: z.infer<typeof analyticsQuerySchema>) {
  assertAbility(ctx, 'analytics.read')
  const [link] = await ctx.db.select({ id: links.id }).from(links).where(and(eq(links.id, linkId), eq(links.workspaceId, ctx.workspaceId))).limit(1)
  if (!link) throw appError(404, 'Link tidak ditemukan.', 'NOT_FOUND')
  const window = await resolveWindow(ctx, query.days)
  const where = and(human(ctx, window.from, window.to), eq(shortLinks.linkId, linkId))
  const day = sql<string>`to_char(${linkClicks.clickedAt} at time zone ${window.tz}, 'YYYY-MM-DD')`
  const [[totals], daily, bySource, devices, cities] = await Promise.all([
    ctx.db.select({ clicks: sql<number>`count(*)::int`, uniques: sql<number>`count(*) filter (where ${linkClicks.isUniqueDay})::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where),
    ctx.db.select({ day, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where).groupBy(sql`1`).orderBy(sql`1`),
    ctx.db.select({ source: shortLinks.source, channel: shortLinks.channel, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where).groupBy(shortLinks.source, shortLinks.channel),
    ctx.db.select({ device: sql<string>`coalesce(${linkClicks.device}, 'other')`, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where).groupBy(sql`1`),
    ctx.db.select({ city: linkClicks.city, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(and(where, sql`${linkClicks.city} is not null`)).groupBy(linkClicks.city).orderBy(desc(sql`count(*)`)).limit(5)
  ])
  return { window: { days: window.days, requestedDays: window.requestedDays, clamped: window.clamped, today: window.today }, totals: totals ?? { clicks: 0, uniques: 0 }, daily, bySource, devices, cities }
}
