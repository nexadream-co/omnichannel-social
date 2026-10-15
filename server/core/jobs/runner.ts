import pLimit from 'p-limit'
import { sql } from 'drizzle-orm'
import type { CoreContext } from '../context'
import type { Database } from '../db/client'
import { handlers } from './handlers'
import { backoffMs, queueDef } from './queues'
import { PermanentJobError, type ClaimedJob } from './types'

export interface RunSummary {
  claimed: number
  done: number
  retried: number
  deferred: number
  dead: number
  released: number
  durationMs: number
}

interface RunOptions {
  budgetMs: number
  ids?: string[]
  batchSize?: number
  now?: () => number
}

type Row = {
  id: string
  queue: string
  payload: Record<string, unknown>
  workspace_id: string | null
  attempts: number
  max_attempts: number
  run_at: Date | string
}

/** One round trip per batch; reclaims jobs whose invocation died (lease expired). docs/blueprint/15 §1.3 */
async function claim(db: Database, limit: number, ids?: string[], exclude: Set<string> = new Set()): Promise<ClaimedJob[]> {
  const idFilter = ids?.length ? sql`and id in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})` : sql``
  // Jobs this invocation already released for lack of budget must not be reclaimed by the same loop.
  const excludeFilter = exclude.size ? sql`and id not in (${sql.join([...exclude].map(id => sql`${id}`), sql`, `)})` : sql``
  const result = await db.execute<Row>(sql`
    update jobs set status = 'running', attempts = attempts + 1, started_at = now(),
      lease_until = now() + (case queue ${sql.raw(leaseCases())} else interval '120 seconds' end)
    where id in (
      select id from jobs
      where ((status = 'queued' and run_at <= now()) or (status = 'running' and lease_until < now()))
      ${idFilter}
      ${excludeFilter}
      order by run_at
      limit ${limit}
      for update skip locked
    )
    returning id, queue, payload, workspace_id, attempts, max_attempts, run_at`)
  return result.rows.map(row => ({
    id: row.id,
    queue: row.queue,
    payload: row.payload ?? {},
    workspaceId: row.workspace_id,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAt: new Date(row.run_at)
  }))
}

function leaseCases(): string {
  return Object.keys(handlers)
    .map(name => `when '${name.replace(/'/g, '')}' then interval '${queueDef(name).leaseSeconds} seconds'`)
    .join(' ')
}

async function finish(db: Database, id: string, status: 'done' | 'dead', error?: string) {
  await db.execute(sql`update jobs set status = ${status}, finished_at = now(), lease_until = null, last_error = ${error ?? null} where id = ${id} and status = 'running'`)
}

async function requeue(db: Database, id: string, runAt: Date, countAttempt: boolean, error?: string) {
  await db.execute(sql`update jobs set status = 'queued', run_at = ${runAt.toISOString()}, lease_until = null,
    attempts = attempts - ${countAttempt ? 0 : 1}, last_error = ${error ?? null} where id = ${id} and status = 'running'`)
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 2000) : String(error).slice(0, 2000)
}

/**
 * Claims due jobs and runs them inside the time budget. Never starts a job with less budget left than its
 * queue's expectedMs; such jobs are released for the next invocation.
 */
export async function runDue(ctx: CoreContext & { db: Database }, options: RunOptions): Promise<RunSummary> {
  const now = options.now ?? Date.now
  const started = now()
  const deadline = started + options.budgetMs
  const batchSize = options.batchSize ?? 20
  const summary: RunSummary = { claimed: 0, done: 0, retried: 0, deferred: 0, dead: 0, released: 0, durationMs: 0 }
  const released = new Set<string>()
  const limits = new Map<string, ReturnType<typeof pLimit>>()
  const limiter = (queue: string) => {
    if (!limits.has(queue)) limits.set(queue, pLimit(queueDef(queue).concurrency))
    return limits.get(queue)!
  }

  while (now() < deadline - 1_000) {
    const batch = await claim(ctx.db, batchSize, options.ids, released)
    if (!batch.length) break
    summary.claimed += batch.length
    await Promise.all(batch.map(job => limiter(job.queue)(async () => {
      const def = queueDef(job.queue)
      const log = ctx.log.child({ jobId: job.id, queue: job.queue, attempt: job.attempts })
      if (deadline - now() < def.expectedMs) {
        await requeue(ctx.db, job.id, new Date(), false)
        released.add(job.id)
        summary.released++
        return
      }
      const handler = handlers[job.queue]
      if (!handler) {
        await finish(ctx.db, job.id, 'dead', `No handler for queue ${job.queue}`)
        summary.dead++
        log.error('job.no_handler')
        return
      }
      if (job.attempts > job.maxAttempts) {
        await finish(ctx.db, job.id, 'dead', 'Lease expired too many times (the invocation kept dying)')
        summary.dead++
        log.error('job.lease_exhausted')
        return
      }
      try {
        const result = await handler(job, { ...ctx, log })
        if (result && 'deferUntil' in result) {
          await requeue(ctx.db, job.id, result.deferUntil, false)
          summary.deferred++
          log.info('job.deferred', { until: result.deferUntil.toISOString() })
        } else {
          await finish(ctx.db, job.id, 'done')
          summary.done++
        }
      } catch (error) {
        const message = describe(error)
        if (error instanceof PermanentJobError || job.attempts >= job.maxAttempts) {
          await finish(ctx.db, job.id, 'dead', message)
          summary.dead++
          log.error('job.dead', { error })
        } else {
          await requeue(ctx.db, job.id, new Date(Date.now() + backoffMs(job.attempts)), true, message)
          summary.retried++
          log.warn('job.retry', { error })
        }
      }
    })))
    if (options.ids) break
  }
  summary.durationMs = now() - started
  return summary
}

/** Runs only the given jobs, right after the request that enqueued them (docs/blueprint/15 §1.4). */
export function kick(ctx: CoreContext & { db: Database }, ids: (string | null)[], budgetMs = 20_000): Promise<RunSummary> {
  const valid = ids.filter((id): id is string => Boolean(id))
  if (!valid.length) return Promise.resolve({ claimed: 0, done: 0, retried: 0, deferred: 0, dead: 0, released: 0, durationMs: 0 })
  return runDue(ctx, { budgetMs, ids: valid })
}
