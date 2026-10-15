import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, jobStatus, tstz } from './_shared'

/** Background work as rows (docs/blueprint/15 §1.1). Payloads carry ids only, never tokens or secrets. */
export const jobs = pgTable('jobs', {
  id: id(),
  queue: text().notNull(),
  payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  workspaceId: text(), // copy of the payload's workspace, for admin filtering only (no FK: jobs outlive nothing)
  status: jobStatus().notNull().default('queued'),
  runAt: tstz().notNull().defaultNow(),
  attempts: integer().notNull().default(0),
  maxAttempts: integer().notNull().default(5),
  leaseUntil: tstz(),
  singletonKey: text(),
  lastError: text(),
  createdAt: createdAt(),
  startedAt: tstz(),
  finishedAt: tstz()
}, t => [
  uniqueIndex('jobs_queue_singleton_live_idx').on(t.queue, t.singletonKey).where(sql`${t.status} in ('queued', 'running') and ${t.singletonKey} is not null`),
  index().on(t.status, t.runAt),
  index().on(t.queue, t.status),
  index().on(t.workspaceId)
])

/** Platform schedules in local time; the per-minute tick claims each slot once (docs/blueprint/15 §1.2). */
export const jobSchedules = pgTable('job_schedules', {
  name: text().primaryKey(),
  cron: text().notNull(),
  tz: text().notNull().default('Asia/Jakarta'),
  lastSlot: tstz(),
  lastJobId: text(),
  enabled: boolean().notNull().default(true)
})

export const systemHeartbeat = pgTable('system_heartbeat', {
  name: text().primaryKey(), // 'tick' | 'media_processor'
  beatAt: tstz().notNull().defaultNow(),
  info: jsonb()
})
