import { CronExpressionParser } from 'cron-parser'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { jobSchedules } from '../db/schema'
import { enqueue } from './enqueue'
import type { QueueName } from './queues'

export interface ScheduleDef {
  name: string
  cron: string
  tz: string
  /** Schedules ship disabled until their handler exists (seeded and flipped by a migration in that milestone). */
  enabled: boolean
}

/** docs/blueprint/15 §3.6. All local times are WIB. */
export const SCHEDULES: ScheduleDef[] = [
  { name: 'billing.daily', cron: '5 0 * * *', tz: 'Asia/Jakarta', enabled: true },
  { name: 'billing.renewal-reminders', cron: '0 7 * * *', tz: 'Asia/Jakarta', enabled: true },
  { name: 'engagement.inactivity', cron: '0 7 * * *', tz: 'Asia/Jakarta', enabled: false },
  { name: 'maintenance.purge', cron: '0 3 * * *', tz: 'Asia/Jakarta', enabled: true },
  { name: 'token.refresh', cron: '0 * * * *', tz: 'Asia/Jakarta', enabled: true },
  { name: 'insights.daily', cron: '30 2 * * *', tz: 'Asia/Jakarta', enabled: false }
]

/** The latest cron time at or before `now` in the schedule's timezone. */
export function latestSlot(cron: string, tz: string, now: Date = new Date()): Date {
  return CronExpressionParser.parse(cron, { currentDate: new Date(now.getTime() + 1), tz }).prev().toDate()
}

/**
 * For each enabled schedule, claim its latest slot once (conditional UPDATE) and enqueue its job in the
 * same transaction. Overlapping ticks race on the UPDATE; only one wins (docs/blueprint/15 §1.2).
 */
export async function fireDueSchedules(db: Database, now: Date = new Date()): Promise<string[]> {
  const schedules = await db.select().from(jobSchedules).where(eq(jobSchedules.enabled, true))
  const fired: string[] = []
  for (const schedule of schedules) {
    const slot = latestSlot(schedule.cron, schedule.tz, now)
    const jobId = await db.transaction(async (tx) => {
      const claimed = await tx.update(jobSchedules)
        .set({ lastSlot: slot })
        .where(and(eq(jobSchedules.name, schedule.name), sql`(${jobSchedules.lastSlot} is null or ${jobSchedules.lastSlot} < ${slot.toISOString()})`))
        .returning({ name: jobSchedules.name })
      if (!claimed.length) return null
      const id = await enqueue(tx, schedule.name as QueueName, { slot: slot.toISOString() }, { singletonKey: slot.toISOString() })
      await tx.update(jobSchedules).set({ lastJobId: id }).where(eq(jobSchedules.name, schedule.name))
      return id
    })
    if (jobId) fired.push(schedule.name)
  }
  return fired
}
