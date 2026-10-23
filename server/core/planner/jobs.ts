import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { addDays, DEFAULT_POSTS_PER_WEEK, weekStart } from '../../../shared/utils/planner'
import type { CoreContext } from '../context'
import type { Database } from '../db/client'
import { contentIdeas, posts, workspaces } from '../db/schema'
import { enqueue } from '../jobs/enqueue'
import type { JobHandler } from '../jobs/types'
import { notifyWorkspaceOwners } from '../notifications'
import { todayKey } from '../timezone'
import { countWeekFill } from './shortcuts'

/**
 * Planner reminders (ARCHITECTURE §8.8), bell only. Each run handles every due workspace in pages of BATCH,
 * re-enqueueing itself with a cursor; the dedupe keys make a doubled slot or a retried page harmless.
 */

type Ctx = CoreContext & { db: Database }
const BATCH = 200
/** Only workspaces that planned or posted lately get the weekly nudge; dormant ones get the win-back email. */
const ACTIVE_WITHIN_DAYS = 60

const alive = and(eq(workspaces.status, 'active'), isNull(workspaces.deletedAt))

/**
 * A slot this old is a catch-up (a new schedule's first tick, or ticks down for hours): "minggu depan" on a
 * Wednesday or "besok" after midnight would be wrong, so it is skipped. Cursor pages carry the original slot.
 */
const STALE_SLOT_MS = 3 * 60 * 60 * 1000
function staleSlot(payload: Record<string, unknown>): boolean {
  const at = typeof payload.slot === 'string' ? Date.parse(payload.slot) : Number.NaN
  return Number.isFinite(at) && Date.now() - at > STALE_SLOT_MS
}

async function nextPage(ctx: Ctx, queue: 'planner.weekly' | 'planner.reminders', payload: Record<string, unknown>, cursor: string) {
  await enqueue(ctx.db, queue, { ...payload, cursor }, { singletonKey: `${String(payload.slot ?? '')}:${cursor}` })
}

/** planner.weekly, Sunday 19:00 WIB: "Minggu depan baru 1 dari 3 postingan" when next week is under target. */
export const plannerWeeklyJob: JobHandler = async (job, base) => {
  const ctx = base as Ctx
  if (staleSlot(job.payload)) return void ctx.log.info('planner.weekly.stale', { slot: job.payload.slot })
  const cursor = typeof job.payload.cursor === 'string' ? job.payload.cursor : ''
  const since = new Date(Date.now() - ACTIVE_WITHIN_DAYS * 86_400_000)
  const page = await ctx.db.select({ id: workspaces.id, timezone: workspaces.timezone, postsPerWeek: workspaces.postsPerWeek }).from(workspaces)
    .where(and(alive, gt(workspaces.id, cursor), sql`(
      exists (select 1 from ${posts} where ${posts.workspaceId} = ${workspaces.id} and ${posts.createdAt} >= ${since})
      or exists (select 1 from ${contentIdeas} where ${contentIdeas.workspaceId} = ${workspaces.id} and ${contentIdeas.createdAt} >= ${since})
    )`))
    .orderBy(asc(workspaces.id)).limit(BATCH)
  let notified = 0
  for (const workspace of page) {
    const monday = weekStart(addDays(todayKey(workspace.timezone), 7))
    const target = workspace.postsPerWeek ?? DEFAULT_POSTS_PER_WEEK
    const count = await countWeekFill(ctx.db, workspace.id, workspace.timezone, monday)
    if (count >= target) continue
    await notifyWorkspaceOwners(ctx, workspace.id, {
      templateKey: 'planner_week_open',
      variables: { count, target, calendarUrl: `/app/calendar?day=${monday}` },
      dedupeKey: `planner_week_open:${workspace.id}:${monday}`
    }, { includeEditors: true })
    notified++
  }
  if (page.length === BATCH) await nextPage(ctx, 'planner.weekly', job.payload, page.at(-1)!.id)
  ctx.log.info('planner.weekly', { checked: page.length, notified })
}

/** planner.reminders, daily 18:00 WIB: open ideas planned for tomorrow that are not posts yet. */
export const plannerRemindersJob: JobHandler = async (job, base) => {
  const ctx = base as Ctx
  if (staleSlot(job.payload)) return void ctx.log.info('planner.reminders.stale', { slot: job.payload.slot })
  const cursor = typeof job.payload.cursor === 'string' ? job.payload.cursor : ''
  const tomorrow = sql`((now() at time zone ${workspaces.timezone})::date + 1)`
  const page = await ctx.db.select({
    workspaceId: contentIdeas.workspaceId,
    day: sql<string>`min(${contentIdeas.plannedOn})::text`,
    n: sql<number>`count(*)::int`,
    first: sql<string>`(array_agg(${contentIdeas.title} order by ${contentIdeas.createdAt}))[1]`
  }).from(contentIdeas).innerJoin(workspaces, eq(workspaces.id, contentIdeas.workspaceId))
    .where(and(alive, eq(contentIdeas.status, 'open'), sql`${contentIdeas.plannedOn} = ${tomorrow}`, gt(contentIdeas.workspaceId, cursor)))
    .groupBy(contentIdeas.workspaceId).orderBy(asc(contentIdeas.workspaceId)).limit(BATCH)
  for (const row of page) {
    const title = row.first.length > 80 ? `${row.first.slice(0, 79)}…` : row.first
    await notifyWorkspaceOwners(ctx, row.workspaceId, {
      templateKey: 'planner_idea_due',
      variables: { title, more: row.n > 1 ? row.n - 1 : '', calendarUrl: `/app/calendar?day=${row.day}` },
      dedupeKey: `planner_idea_due:${row.workspaceId}:${row.day}`
    }, { includeEditors: true })
  }
  if (page.length === BATCH) await nextPage(ctx, 'planner.reminders', job.payload, page.at(-1)!.workspaceId)
  ctx.log.info('planner.reminders', { workspaces: page.length })
}
