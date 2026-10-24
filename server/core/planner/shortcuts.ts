import { and, asc, count, countDistinct, eq, gte, lt, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { addDays, IDEA_MAX_LINKS, IDEA_MAX_MEDIA, IDEA_NOTE_MAX, IDEA_TITLE_MAX, spreadOverEmptyDays, SPREAD_HORIZON_DAYS, weekStart } from '../../../shared/utils/planner'
import { recordAudit } from '../audit'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Executor } from '../db/client'
import { contentIdeaLinks, contentIdeaMedia, contentIdeas, postMedia, posts, postTargets } from '../db/schema'
import { appError } from '../errors'
import { productLinksOfPost } from '../links/service'
import { startOfZonedDay, todayKey, zonedDateKey } from '../timezone'
import { assertOwned, assertRoomForIdeas, getIdea, plannerWindow, workspaceTimezone } from './ideas'

/** Ideas started from elsewhere in the app: Galeri Media, a post that worked, and the Beranda week card. */

const locale = z.enum(['id', 'en']).default('id')

const TEXT = {
  id: { gallery: (i: number, n: number) => n > 1 ? `Konten dari Galeri ${i}/${n}` : 'Konten dari Galeri', carousel: 'Carousel dari Galeri', repeat: 'Ulangi postingan yang berhasil' },
  en: { gallery: (i: number, n: number) => n > 1 ? `Gallery content ${i}/${n}` : 'Gallery content', carousel: 'Gallery carousel', repeat: 'Repeat a post that worked' }
}

const audit = (ctx: WorkspaceContext, action: string, id: string | null, metadata?: Record<string, unknown>) =>
  recordAudit(ctx, { audience: 'creator', action, workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'content_idea', targetId: id ?? undefined, metadata })

/** Local days in [from, from + days) that already hold a post (not cancelled) or an open idea. */
async function busyDays(db: Executor, workspaceId: string, tz: string, from: string, days: number): Promise<Set<string>> {
  const to = addDays(from, days)
  const [targets, ideas] = await Promise.all([
    db.select({ at: postTargets.scheduledAt }).from(postTargets)
      .where(and(eq(postTargets.workspaceId, workspaceId), ne(postTargets.status, 'cancelled'), gte(postTargets.scheduledAt, startOfZonedDay(from, tz)), lt(postTargets.scheduledAt, startOfZonedDay(to, tz)))),
    db.select({ day: contentIdeas.plannedOn }).from(contentIdeas)
      .where(and(eq(contentIdeas.workspaceId, workspaceId), eq(contentIdeas.status, 'open'), gte(contentIdeas.plannedOn, from), lt(contentIdeas.plannedOn, to)))
  ])
  return new Set([...targets.flatMap(t => t.at ? [zonedDateKey(t.at, tz)] : []), ...ideas.flatMap(i => i.day ? [i.day] : [])])
}

export const fromMediaSchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1, 'Pilih minimal satu foto atau video.').max(IDEA_MAX_MEDIA, `Maksimal ${IDEA_MAX_MEDIA} foto atau video sekali jalan.`)
    .transform(ids => [...new Set(ids)]),
  mode: z.enum(['each', 'one']).default('each'), // each: one idea per item, spread over empty days; one: a carousel idea
  locale
})

/** Galeri Media → "Jadikan ide": batch-shot content becomes ideas on the next empty days (from tomorrow). */
export async function createIdeasFromMedia(ctx: WorkspaceContext, input: z.infer<typeof fromMediaSchema>) {
  assertAbility(ctx, 'posts.write')
  await assertOwned(ctx, { mediaIds: input.mediaIds })
  const groups = input.mode === 'each' ? input.mediaIds.map(id => [id]) : [input.mediaIds]
  await assertRoomForIdeas(ctx, groups.length)
  const tz = await workspaceTimezone(ctx.db, ctx.workspaceId)
  const from = addDays(todayKey(tz), 1)
  const days = input.mode === 'each'
    ? spreadOverEmptyDays(from, await busyDays(ctx.db, ctx.workspaceId, tz, from, SPREAD_HORIZON_DAYS), groups.length)
    : [null]
  const text = TEXT[input.locale]
  const items = await ctx.db.transaction(async (tx) => {
    const rows = await tx.insert(contentIdeas).values(groups.map((_, i) => ({
      workspaceId: ctx.workspaceId, authorUserId: ctx.userId, plannedOn: days[i] ?? null,
      title: input.mode === 'each' ? text.gallery(i + 1, groups.length) : text.carousel
    }))).returning({ id: contentIdeas.id, plannedOn: contentIdeas.plannedOn })
    await tx.insert(contentIdeaMedia).values(rows.flatMap((row, i) => groups[i]!.map((mediaId, position) => ({ workspaceId: ctx.workspaceId, ideaId: row.id, mediaId, position }))))
    return rows
  })
  await audit(ctx, 'idea.from_media', null, { ideas: items.length, media: input.mediaIds.length })
  return { items }
}

export const fromPostSchema = z.object({ locale })

/**
 * "Jadikan ide lagi": a post becomes an undated idea with its words, media, products and content type.
 * Product short links leave the text and come back as products, so the next post gets fresh attribution.
 */
export async function ideaFromPost(ctx: WorkspaceContext, postId: string, input: z.infer<typeof fromPostSchema>) {
  assertAbility(ctx, 'posts.write')
  const [post] = await ctx.db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspaceId))).limit(1)
  if (!post) throw appError(404, 'Postingan tidak ditemukan.', 'NOT_FOUND')
  await assertRoomForIdeas(ctx, 1)
  const [targets, media] = await Promise.all([
    ctx.db.select({ captionOverride: postTargets.captionOverride }).from(postTargets).where(eq(postTargets.postId, postId)),
    ctx.db.select({ mediaId: postMedia.mediaId }).from(postMedia).where(eq(postMedia.postId, postId)).orderBy(asc(postMedia.position))
  ])
  const products = await productLinksOfPost(ctx.db, ctx.workspaceId, postId, [post.baseCaption, ...targets.map(t => t.captionOverride ?? '')])
  let caption = post.baseCaption
  for (const url of products.vaultUrls) caption = caption.replaceAll(url, '')
  const lines = caption.split('\n').map(line => line.trimEnd())
  const first = lines.findIndex(line => line.trim())
  const title = (first >= 0 ? lines[first]!.trim() : TEXT[input.locale].repeat).slice(0, IDEA_TITLE_MAX)
  const note = (first >= 0 ? lines.slice(first + 1).join('\n').trim() : '').slice(0, IDEA_NOTE_MAX) || null
  const id = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(contentIdeas).values({ workspaceId: ctx.workspaceId, authorUserId: ctx.userId, title, note, pillar: post.pillar })
      .returning({ id: contentIdeas.id })
    const linkIds = products.linkIds.slice(0, IDEA_MAX_LINKS)
    const mediaIds = [...new Set(media.map(m => m.mediaId))].slice(0, IDEA_MAX_MEDIA)
    if (linkIds.length) await tx.insert(contentIdeaLinks).values(linkIds.map((linkId, position) => ({ workspaceId: ctx.workspaceId, ideaId: row!.id, linkId, position })))
    if (mediaIds.length) await tx.insert(contentIdeaMedia).values(mediaIds.map((mediaId, position) => ({ workspaceId: ctx.workspaceId, ideaId: row!.id, mediaId, position })))
    return row!.id
  })
  await audit(ctx, 'idea.from_post', id, { postId })
  return getIdea(ctx, id)
}

/** Posts scheduled in the local week starting `monday` plus open ideas planned in it: the "terisi" count. */
export async function countWeekFill(db: Executor, workspaceId: string, tz: string, monday: string): Promise<number> {
  const sunday = addDays(monday, 7)
  const [[postCount], [ideaCount]] = await Promise.all([
    db.select({ n: countDistinct(postTargets.postId) }).from(postTargets)
      .where(and(eq(postTargets.workspaceId, workspaceId), ne(postTargets.status, 'cancelled'), gte(postTargets.scheduledAt, startOfZonedDay(monday, tz)), lt(postTargets.scheduledAt, startOfZonedDay(sunday, tz)))),
    db.select({ n: count() }).from(contentIdeas)
      .where(and(eq(contentIdeas.workspaceId, workspaceId), eq(contentIdeas.status, 'open'), gte(contentIdeas.plannedOn, monday), lt(contentIdeas.plannedOn, sunday)))
  ])
  return (postCount?.n ?? 0) + (ideaCount?.n ?? 0)
}

export const STREAK_LOOKBACK_WEEKS = 12

/**
 * Consecutive local weeks, newest first, in which distinct non-cancelled posts reached `target`. The current week
 * counts when it already reached the target (`currentFilled`, ideas included, as the Kalender shows it); otherwise
 * the streak ends last week. Past weeks count posts only. One grouped query, at most 12 weeks back.
 */
export async function weekStreak(db: Executor, workspaceId: string, tz: string, monday: string, target: number, currentFilled: number): Promise<number> {
  const from = addDays(monday, -7 * STREAK_LOOKBACK_WEEKS)
  const week = sql<string>`to_char(date_trunc('week', ${postTargets.scheduledAt} AT TIME ZONE ${tz}), 'YYYY-MM-DD')`
  const rows = await db.select({ week, n: countDistinct(postTargets.postId) }).from(postTargets)
    .where(and(eq(postTargets.workspaceId, workspaceId), ne(postTargets.status, 'cancelled'), gte(postTargets.scheduledAt, startOfZonedDay(from, tz)), lt(postTargets.scheduledAt, startOfZonedDay(monday, tz))))
    .groupBy(sql`1`)
  const counts = new Map(rows.map(r => [r.week, r.n]))
  let streak = currentFilled >= target ? 1 : 0
  for (let i = 1; i <= STREAK_LOOKBACK_WEEKS; i++) {
    if ((counts.get(addDays(monday, -7 * i)) ?? 0) < target) break
    streak++
  }
  return streak
}

/** Beranda "Minggu ini": this week's fill, ideas waiting and the next shopping moment. */
export async function weekSummary(ctx: WorkspaceContext) {
  assertAbility(ctx, 'posts.read')
  const tz = await workspaceTimezone(ctx.db, ctx.workspaceId)
  const today = todayKey(tz)
  const monday = weekStart(today)
  const [filled, window] = await Promise.all([
    countWeekFill(ctx.db, ctx.workspaceId, tz, monday),
    plannerWindow(ctx, monday, addDays(monday, 7), today)
  ])
  const streak = await weekStreak(ctx.db, ctx.workspaceId, tz, monday, window.postsPerWeek, filled)
  const nextMoment = window.moments.filter(m => m.endsOn >= today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null
  return { weekStart: monday, today, count: filled, target: window.postsPerWeek, unplannedIdeas: window.unplannedIdeas, streak, nextMoment }
}
