import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Database } from '../db/client'
import { bioPages, dmEvents, dmRules, linkClicks, links, posts, postTargets, shortLinks, socialAccounts, workspaces } from '../db/schema'
import { getEntitlements } from '../entitlements'
import { latestInsights } from '../engagement-jobs'
import { appError } from '../errors'
import { bioUrl } from '../links/service'
import { type WorkspaceAnalytics, ratePer1000, RATE_MIN_AGE_HOURS, viewsOf } from '../../../shared/utils/analytics'
import { OVERDUE_GRACE_MS } from '../../../shared/utils/overdue'

export const analyticsQuerySchema = z.object({ days: z.coerce.number().int().refine(v => [7, 30, 90].includes(v)).default(7) })

/** At most this many post targets are read per window for the posting numbers; a creator publishing more than this per period is far outside v1 plans. */
const POSTING_TARGET_CAP = 2000

/**
 * Reads clamp, never refuse (docs/blueprint/06 §5): a window longer than the plan's click history
 * is shortened, and the response says so.
 */
async function resolveWindow(ctx: WorkspaceContext, days: number) {
  const { limits } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  const retention = limits.clickRetentionDays
  const allowed = retention === -1 ? days : Math.min(days, retention)
  const [ws] = await ctx.db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
  const tz = ws?.timezone ?? 'Asia/Jakarta'
  // Whole local days: the window starts at midnight in the workspace's timezone, so totals equal the sum of the bars.
  const localStart = (back: number) => sql`to_char(((date_trunc('day', now() at time zone ${tz}) - make_interval(days => ${back})) at time zone ${tz}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
  const [bounds] = await ctx.db.execute<{ from: string, prevFrom: string, today: string }>(sql`select ${localStart(allowed - 1)} as "from", ${localStart(2 * allowed - 1)} as "prevFrom", to_char(now() at time zone ${tz}, 'YYYY-MM-DD') as today`).then(r => r.rows)
  const to = new Date()
  const from = new Date(bounds!.from)
  const prevFrom = new Date(bounds!.prevFrom)
  const today = bounds!.today
  // The period before is only shown when the plan's click history reaches back that far.
  const hasPrevious = retention === -1 || 2 * allowed <= retention
  return { from, to, prevFrom, hasPrevious, days: allowed, requestedDays: days, clamped: allowed < days, tz, today }
}

const human = (ctx: WorkspaceContext, from: Date, to: Date) => and(eq(linkClicks.workspaceId, ctx.workspaceId), eq(linkClicks.isBot, false), gte(linkClicks.clickedAt, from), lt(linkClicks.clickedAt, to))

type Window = Awaited<ReturnType<typeof resolveWindow>>

/** Posts published in [from, to), each with its latest views number (null when the platform gives none). */
async function publishedTargets(ctx: WorkspaceContext, from: Date, to: Date) {
  const rows = await ctx.db.select({ id: postTargets.id, platform: postTargets.platform, publishedAt: postTargets.publishedAt }).from(postTargets)
    .where(and(eq(postTargets.workspaceId, ctx.workspaceId), eq(postTargets.status, 'published'), isNull(postTargets.removedAt), gte(postTargets.publishedAt, from), lt(postTargets.publishedAt, to)))
    .limit(POSTING_TARGET_CAP)
  const insights = await latestInsights(ctx.db as Database, rows.map(r => r.id))
  return rows.map(r => ({ ...r, views: viewsOf(insights.get(r.id)?.metrics) }))
}

/** Views and human clicks of the posts in [from, to) that are old enough to judge (all their clicks are inside click retention). */
async function postingRate(ctx: WorkspaceContext, targets: Awaited<ReturnType<typeof publishedTargets>>, now: Date) {
  const cutoff = now.getTime() - RATE_MIN_AGE_HOURS * 3_600_000
  const measured = targets.filter(t => t.views !== null && t.publishedAt && t.publishedAt.getTime() <= cutoff)
  const views = measured.reduce((sum, t) => sum + (t.views ?? 0), 0)
  let clicks = 0
  if (measured.length) {
    const [row] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId))
      .where(and(eq(linkClicks.workspaceId, ctx.workspaceId), eq(linkClicks.isBot, false), inArray(shortLinks.postTargetId, measured.map(t => t.id))))
    clicks = row?.n ?? 0
  }
  return { measured: measured.length, views, clicks, ratePer1000: ratePer1000(clicks, views) }
}

async function postingStats(ctx: WorkspaceContext, window: Window): Promise<WorkspaceAnalytics['posting']> {
  const [current, before] = await Promise.all([
    publishedTargets(ctx, window.from, window.to),
    window.hasPrevious ? publishedTargets(ctx, window.prevFrom, window.from) : Promise.resolve(null)
  ])
  const [now, prev] = await Promise.all([postingRate(ctx, current, window.to), before ? postingRate(ctx, before, window.to) : Promise.resolve(null)])
  return {
    published: current.length,
    measured: now.measured,
    views: now.views,
    clicks: now.clicks,
    ratePer1000: now.ratePer1000,
    previousRatePer1000: prev && prev.measured ? prev.ratePer1000 : null,
    // Facebook gives no views number yet; other platforms always do.
    noViewsPlatforms: current.some(t => t.platform === 'facebook') ? ['facebook'] : []
  }
}

const SENT_STATUSES = ['dm_sent', 'replied'] as const

async function autoReplyStats(ctx: WorkspaceContext, window: Window) {
  const eventsIn = (from: Date, to: Date) => and(eq(dmEvents.workspaceId, ctx.workspaceId), gte(dmEvents.createdAt, from), lt(dmEvents.createdAt, to))
  const sentCount = sql<number>`count(*) filter (where ${inArray(dmEvents.status, [...SENT_STATUSES])})::int`
  const dmClicks = and(human(ctx, window.from, window.to), eq(shortLinks.source, 'dm'))
  const [[events], [previousEvents], [clicks], ruleEvents, ruleClicks] = await Promise.all([
    ctx.db.select({ matched: sql<number>`count(*)::int`, sent: sentCount }).from(dmEvents).where(eventsIn(window.from, window.to)),
    window.hasPrevious ? ctx.db.select({ sent: sentCount }).from(dmEvents).where(eventsIn(window.prevFrom, window.from)) : Promise.resolve([]),
    ctx.db.select({ clicks: sql<number>`count(*)::int`, unattributed: sql<number>`count(*) filter (where ${shortLinks.dmRuleId} is null)::int` })
      .from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(dmClicks),
    ctx.db.select({ ruleId: dmEvents.ruleId, matched: sql<number>`count(*)::int`, sent: sentCount }).from(dmEvents).where(and(eventsIn(window.from, window.to), isNotNull(dmEvents.ruleId))).groupBy(dmEvents.ruleId),
    ctx.db.select({ ruleId: shortLinks.dmRuleId, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(and(dmClicks, isNotNull(shortLinks.dmRuleId))).groupBy(shortLinks.dmRuleId)
  ])
  const stats = new Map<string, { matched: number, sent: number, clicks: number }>()
  for (const r of ruleEvents) stats.set(r.ruleId!, { matched: r.matched, sent: r.sent, clicks: 0 })
  for (const r of ruleClicks) stats.set(r.ruleId!, { matched: 0, sent: 0, ...stats.get(r.ruleId!), clicks: r.clicks })
  // Deleted rules are not listed (inner join); their numbers stay in the totals.
  const existing = stats.size
    ? await ctx.db.select({ id: dmRules.id, name: dmRules.name, active: dmRules.active }).from(dmRules).where(and(eq(dmRules.workspaceId, ctx.workspaceId), inArray(dmRules.id, [...stats.keys()])))
    : []
  const rules = existing.map(r => ({ ruleId: r.id, name: r.name, active: r.active, ...stats.get(r.id)! }))
    .filter(r => r.matched > 0 || r.clicks > 0)
    .sort((a, b) => b.sent - a.sent || b.clicks - a.clicks)
    .slice(0, 5)
  return {
    autoReply: { matched: events?.matched ?? 0, sent: events?.sent ?? 0, clicks: clicks?.clicks ?? 0, unattributedClicks: clicks?.unattributed ?? 0, rules },
    previousDmSent: window.hasPrevious ? previousEvents?.sent ?? 0 : null
  }
}

export async function workspaceAnalytics(ctx: WorkspaceContext, query: z.infer<typeof analyticsQuerySchema>): Promise<WorkspaceAnalytics> {
  assertAbility(ctx, 'analytics.read')
  const window = await resolveWindow(ctx, query.days)
  const where = human(ctx, window.from, window.to)
  const day = sql<string>`to_char(${linkClicks.clickedAt} at time zone ${window.tz}, 'YYYY-MM-DD')`
  const totalsOf = (clause: SQL | undefined) => ctx.db.select({ clicks: sql<number>`count(*)::int`, uniques: sql<number>`count(*) filter (where ${linkClicks.isUniqueDay})::int` }).from(linkClicks).where(clause)
  const cutoff = new Date(window.to.getTime() - RATE_MIN_AGE_HOURS * 3_600_000)
  // Every target of the post published inside the window and old enough: then its windowed clicks equal its lifetime clicks.
  const rateable = sql<boolean>`coalesce(bool_and(${postTargets.publishedAt} >= ${window.from} and ${postTargets.publishedAt} < ${window.to} and ${postTargets.publishedAt} <= ${cutoff}), false)`
  const [[totals], daily, topLinks, bySource, byChannel, topPosts, devices, cities, [previousTotals], posting, reply] = await Promise.all([
    totalsOf(where),
    ctx.db.select({ day, clicks: sql<number>`count(*)::int` }).from(linkClicks).where(where).groupBy(sql`1`).orderBy(sql`1`),
    ctx.db.select({ linkId: links.id, title: links.title, merchant: links.merchant, imageUrl: links.imageUrl, clicks: sql<number>`count(*)::int` })
      .from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).innerJoin(links, eq(links.id, shortLinks.linkId))
      .where(where).groupBy(links.id).orderBy(desc(sql`count(*)`)).limit(5),
    ctx.db.select({ source: shortLinks.source, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where).groupBy(shortLinks.source),
    ctx.db.select({ channel: sql<string>`coalesce(${shortLinks.channel}, 'other')`, clicks: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).where(where).groupBy(sql`1`),
    ctx.db.select({ postId: posts.id, caption: posts.baseCaption, platform: postTargets.platform, clicks: sql<number>`count(distinct ${linkClicks.id})::int`, targetIds: sql<string[]>`array_agg(distinct ${postTargets.id})`, rateable })
      .from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).innerJoin(postTargets, eq(postTargets.id, shortLinks.postTargetId)).innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(where).groupBy(posts.id, postTargets.platform).orderBy(desc(sql`count(*)`)).limit(5),
    ctx.db.select({ device: sql<string>`coalesce(${linkClicks.device}, 'other')`, clicks: sql<number>`count(*)::int` }).from(linkClicks).where(where).groupBy(sql`1`),
    ctx.db.select({ city: sql<string>`${linkClicks.city}`, clicks: sql<number>`count(*)::int` }).from(linkClicks).where(and(where, sql`${linkClicks.city} is not null`)).groupBy(linkClicks.city).orderBy(desc(sql`count(*)`)).limit(5),
    window.hasPrevious ? totalsOf(human(ctx, window.prevFrom, window.from)) : Promise.resolve([]),
    postingStats(ctx, window),
    autoReplyStats(ctx, window)
  ])
  const insights = await latestInsights(ctx.db as Database, topPosts.flatMap(p => p.targetIds))
  return {
    window: { days: window.days, requestedDays: window.requestedDays, clamped: window.clamped, today: window.today },
    totals: totals ?? { clicks: 0, uniques: 0 },
    previous: window.hasPrevious ? { clicks: previousTotals?.clicks ?? 0, uniques: previousTotals?.uniques ?? 0, dmSent: reply.previousDmSent ?? 0 } : null,
    daily, topLinks, bySource, byChannel,
    topPosts: topPosts.map((p) => {
      const numbers = p.targetIds.map(id => viewsOf(insights.get(id)?.metrics)).filter((v): v is number => v !== null)
      const views = numbers.length ? numbers.reduce((a, b) => a + b, 0) : null
      return { postId: p.postId, caption: p.caption.slice(0, 100), platform: p.platform, clicks: p.clicks, views, ratePer1000: p.rateable ? ratePer1000(p.clicks, views) : null }
    }),
    devices, cities, posting, autoReply: reply.autoReply
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

/** Beranda numbers (docs/SCREENS.md #12): last 7 days, all-time clicks for round numbers, the first published post, and what needs a fix. */
export async function homeSummary(ctx: WorkspaceContext) {
  assertAbility(ctx, 'analytics.read')
  const since = new Date(Date.now() - 7 * 86_400_000)
  const where = human(ctx, since, new Date())
  const overdueBefore = new Date(Date.now() - OVERDUE_GRACE_MS)
  const [[clicks], [clicksAll], topProducts, [dms], [reauth], [first], [bio], [overdue]] = await Promise.all([
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(linkClicks).where(where),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(linkClicks).where(and(eq(linkClicks.workspaceId, ctx.workspaceId), eq(linkClicks.isBot, false))),
    ctx.db.select({ linkId: links.id, title: links.title, imageUrl: links.imageUrl, clicks: sql<number>`count(*)::int` })
      .from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId)).innerJoin(links, eq(links.id, shortLinks.linkId))
      .where(where).groupBy(links.id).orderBy(desc(sql`count(*)`)).limit(3),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(dmEvents).where(and(eq(dmEvents.workspaceId, ctx.workspaceId), eq(dmEvents.status, 'dm_sent'), gte(dmEvents.updatedAt, since))),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, ctx.workspaceId), eq(socialAccounts.status, 'needs_reauth'))),
    ctx.db.select({ postId: postTargets.postId, platform: postTargets.platform, permalink: postTargets.permalink, publishedAt: postTargets.publishedAt }).from(postTargets)
      .where(and(eq(postTargets.workspaceId, ctx.workspaceId), eq(postTargets.status, 'published'), sql`${postTargets.publishedAt} is not null`)).orderBy(asc(postTargets.publishedAt)).limit(1),
    ctx.db.select({ handle: bioPages.handle }).from(bioPages).where(and(eq(bioPages.workspaceId, ctx.workspaceId), eq(bioPages.published, true))).limit(1),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(posts).where(and(eq(posts.workspaceId, ctx.workspaceId), eq(posts.status, 'scheduled'), lt(posts.scheduledAt, overdueBefore)))
  ])
  return {
    clicks7d: clicks?.n ?? 0,
    clicksTotal: clicksAll?.n ?? 0,
    autoReplies7d: dms?.n ?? 0,
    topProducts,
    needsReauth: reauth?.n ?? 0,
    firstPublished: first ? { postId: first.postId, platform: first.platform, permalink: first.permalink, publishedAt: first.publishedAt } : null,
    bioUrl: bio ? bioUrl(bio.handle) : null,
    overdueCount: overdue?.n ?? 0
  }
}
