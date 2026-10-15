import { sql } from 'drizzle-orm'
import type { CoreContext } from '../context'
import type { Database } from '../db/client'
import { systemHeartbeat } from '../db/schema'
import { env } from '../env'
import { runDue, type RunSummary } from './runner'
import { fireDueSchedules } from './schedules'
import { SIGNATURE_HEADER, signBody } from './signing'

type Ctx = CoreContext & { db: Database }

export interface TickSummary extends RunSummary {
  schedulesFired: string[]
  backlog: number
  fannedOut: number
}

export async function dueBacklog(db: Database): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`select count(*)::text as count from jobs where status = 'queued' and run_at <= now()`)
  return Number(result.rows[0]?.count ?? 0)
}

/** Fire-and-forget signed calls to /api/internal/jobs/run, each a fresh invocation with its own budget. */
function fanOut(ctx: Ctx, count: number): number {
  const config = env()
  if (!config.INTERNAL_SIGNING_SECRET || count <= 0) return 0
  const body = JSON.stringify({ reason: 'fanout' })
  for (let i = 0; i < count; i++) {
    ctx.defer(fetch(`${config.siteUrl}/api/internal/jobs/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signBody(config.INTERNAL_SIGNING_SECRET, body) },
      body,
      signal: AbortSignal.timeout(2_000)
    }).catch(() => undefined)) // the fan-out target keeps running after we stop waiting
  }
  return count
}

/**
 * The per-minute tick (docs/blueprint/15 §1). Ticks can be missed, doubled or overlap: everything is
 * claimed with SKIP LOCKED and schedules use slot claims, so a duplicate tick finds nothing left to do.
 */
export async function runTick(ctx: Ctx, options: { budgetMs?: number } = {}): Promise<TickSummary> {
  const config = env()
  const budgetMs = options.budgetMs ?? config.JOBS_TIME_BUDGET_MS
  const schedulesFired = await fireDueSchedules(ctx.db)
  const run = await runDue(ctx, { budgetMs })
  const backlog = await dueBacklog(ctx.db)
  const fannedOut = backlog > 0 ? fanOut(ctx, Math.min(config.JOBS_FANOUT_MAX, Math.ceil(backlog / 20))) : 0
  const summary: TickSummary = { ...run, schedulesFired, backlog, fannedOut }
  await ctx.db.insert(systemHeartbeat).values({ name: 'tick', beatAt: new Date(), info: summary })
    .onConflictDoUpdate({ target: systemHeartbeat.name, set: { beatAt: new Date(), info: summary } })
  ctx.log.info('tick.done', { ...summary })
  return summary
}
