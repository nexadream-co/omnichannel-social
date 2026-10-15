import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Executor } from '../db/client'
import { jobs } from '../db/schema'
import { queueDef, type QueueName } from './queues'

export interface EnqueueOptions {
  runAt?: Date
  singletonKey?: string
  maxAttempts?: number
  workspaceId?: string | null
}

/**
 * A plain INSERT, so it joins the caller's transaction (docs/blueprint/15 §1 rule 1).
 * Returns the job id, or null when a live job with the same singleton key already exists.
 */
export async function enqueue(db: Executor, queue: QueueName, payload: Record<string, unknown> = {}, options: EnqueueOptions = {}): Promise<string | null> {
  const workspaceId = options.workspaceId ?? (typeof payload.workspaceId === 'string' ? payload.workspaceId : null)
  const rows = await db.insert(jobs).values({
    queue,
    payload,
    workspaceId,
    runAt: options.runAt ?? sql`now()`,
    singletonKey: options.singletonKey ?? null,
    maxAttempts: options.maxAttempts ?? queueDef(queue).maxAttempts
  }).onConflictDoNothing().returning({ id: jobs.id })
  return rows[0]?.id ?? null
}

/** Cancels jobs that are still queued (e.g. a rescheduled post's old job). Running jobs finish and see the stale state. */
export async function cancelQueuedJobs(db: Executor, ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const rows = await db.update(jobs)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(and(inArray(jobs.id, ids), eq(jobs.status, 'queued')))
    .returning({ id: jobs.id })
  return rows.length
}
