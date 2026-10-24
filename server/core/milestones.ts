import { and, eq, sql } from 'drizzle-orm'
import { isMilestoneKey, WEEK_TARGET_KEY } from '../../shared/utils/milestones'
import { addDays, weekStart } from '../../shared/utils/planner'
import { assertAbility, type WorkspaceContext } from './context'
import { workspaces } from './db/schema'
import { appError } from './errors'
import { todayKey } from './timezone'

/**
 * Records a first-time moment (POST /api/app/milestones/:key). The first timestamp is kept: in one UPDATE the
 * existing object is on the right of `||`, so it wins and two racing calls cannot overwrite each other.
 * Staff impersonating a creator never consume a moment, so the creator still gets it later.
 */
export async function recordMilestone(ctx: WorkspaceContext, key: string): Promise<{ recorded: boolean, milestones: Record<string, string> }> {
  assertAbility(ctx, 'posts.read')
  if (!isMilestoneKey(key)) throw appError(422, 'Momen ini tidak dikenal.', 'VALIDATION_FAILED')
  // Week targets are only celebrated for this or last week's Monday, so the profile JSON cannot grow without bound.
  if (WEEK_TARGET_KEY.test(key)) {
    const [row] = await ctx.db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
    const monday = weekStart(todayKey(row?.timezone ?? 'Asia/Jakarta'))
    if (![monday, addDays(monday, -7)].includes(key.slice('weekTarget:'.length))) throw appError(422, 'Momen ini tidak dikenal.', 'VALIDATION_FAILED')
  }
  if (ctx.impersonatorId) return { recorded: false, milestones: await readMilestones(ctx) }

  const [row] = await ctx.db.update(workspaces)
    .set({ milestones: sql`jsonb_build_object(${key}::text, to_jsonb(now())) || ${workspaces.milestones}` })
    .where(and(eq(workspaces.id, ctx.workspaceId), sql`NOT (${workspaces.milestones} ? ${key}::text)`))
    .returning({ milestones: workspaces.milestones })
  if (row) return { recorded: true, milestones: row.milestones }
  return { recorded: false, milestones: await readMilestones(ctx) }
}

async function readMilestones(ctx: WorkspaceContext): Promise<Record<string, string>> {
  const [row] = await ctx.db.select({ milestones: workspaces.milestones }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
  return row?.milestones ?? {}
}
