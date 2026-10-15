import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../../server/core/db/client'
import { jobs, jobSchedules } from '../../server/core/db/schema'
import { enqueue, fireDueSchedules, kick, PermanentJobError, runDue, runTick, type QueueName } from '../../server/core/jobs'
import { handlers } from '../../server/core/jobs/handlers'
import { testContext, truncate } from './helpers'

const q = (name: string) => name as QueueName
const calls: string[] = []
handlers['test.ok'] = async job => void calls.push(String(job.payload.n))
handlers['test.flaky'] = async () => {
  throw new Error('temporary')
}
handlers['test.permanent'] = async () => {
  throw new PermanentJobError('nope')
}
handlers['test.defer'] = async () => ({ deferUntil: new Date(Date.now() + 60_000) })

async function job(id: string) {
  return (await getDb().select().from(jobs).where(eq(jobs.id, id)))[0]!
}

beforeEach(async () => {
  calls.length = 0
  await truncate('jobs', 'job_schedules', 'system_heartbeat')
})
afterAll(closeDb)

describe('job runner', () => {
  it('runs due jobs once and leaves future jobs alone', async () => {
    const ctx = testContext()
    const due = await enqueue(ctx.db, q('test.ok'), { n: 1 })
    const future = await enqueue(ctx.db, q('test.ok'), { n: 2 }, { runAt: new Date(Date.now() + 3_600_000) })
    const summary = await runDue(ctx, { budgetMs: 30_000 })
    expect(summary.done).toBe(1)
    expect(calls).toEqual(['1'])
    expect((await job(due!)).status).toBe('done')
    expect((await job(future!)).status).toBe('queued')
    expect((await runDue(ctx, { budgetMs: 30_000 })).claimed).toBe(0)
  })

  it('dedupes live singleton keys but allows a new one after completion', async () => {
    const ctx = testContext()
    expect(await enqueue(ctx.db, q('test.ok'), { n: 1 }, { singletonKey: 'k' })).toBeTruthy()
    expect(await enqueue(ctx.db, q('test.ok'), { n: 1 }, { singletonKey: 'k' })).toBeNull()
    await runDue(ctx, { budgetMs: 30_000 })
    expect(await enqueue(ctx.db, q('test.ok'), { n: 1 }, { singletonKey: 'k' })).toBeTruthy()
  })

  it('retries transient errors with backoff, then goes dead', async () => {
    const ctx = testContext()
    const id = (await enqueue(ctx.db, q('test.flaky'), {}, { maxAttempts: 2 }))!
    await runDue(ctx, { budgetMs: 30_000 })
    let row = await job(id)
    expect(row.status).toBe('queued')
    expect(row.attempts).toBe(1)
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now())
    await ctx.db.update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.id, id))
    await runDue(ctx, { budgetMs: 30_000 })
    row = await job(id)
    expect(row.status).toBe('dead')
    expect(row.lastError).toContain('temporary')
  })

  it('sends permanent errors straight to dead and defers without counting an attempt', async () => {
    const ctx = testContext()
    const dead = (await enqueue(ctx.db, q('test.permanent'), {}))!
    const deferred = (await enqueue(ctx.db, q('test.defer'), {}))!
    await runDue(ctx, { budgetMs: 30_000 })
    expect((await job(dead)).status).toBe('dead')
    const row = await job(deferred)
    expect(row.status).toBe('queued')
    expect(row.attempts).toBe(0)
  })

  it('reclaims a job whose invocation died (lease expired)', async () => {
    const ctx = testContext()
    const id = (await enqueue(ctx.db, q('test.ok'), { n: 7 }))!
    await ctx.db.update(jobs).set({ status: 'running', attempts: 1, leaseUntil: new Date(Date.now() - 1000) }).where(eq(jobs.id, id))
    await runDue(ctx, { budgetMs: 30_000 })
    expect((await job(id)).status).toBe('done')
    expect(calls).toEqual(['7'])
  })

  it('never double-runs a job when two runners race', async () => {
    const ctx = testContext()
    for (let n = 0; n < 30; n++) await enqueue(ctx.db, q('test.ok'), { n })
    await Promise.all([runDue(ctx, { budgetMs: 30_000 }), runDue(ctx, { budgetMs: 30_000 }), runDue(ctx, { budgetMs: 30_000 })])
    expect(calls.length).toBe(30)
    expect(new Set(calls).size).toBe(30)
  })

  it('kick runs only the given jobs', async () => {
    const ctx = testContext()
    const mine = await enqueue(ctx.db, q('test.ok'), { n: 'mine' })
    await enqueue(ctx.db, q('test.ok'), { n: 'other' })
    await kick(ctx, [mine])
    expect(calls).toEqual(['mine'])
  })

  it('releases jobs when the budget is too small', async () => {
    const ctx = testContext()
    const id = (await enqueue(ctx.db, q('maintenance.purge'), {}))!
    const summary = await runDue(ctx, { budgetMs: 5_000 }) // purge expects 30 s
    expect(summary.released).toBe(1)
    const row = await job(id)
    expect(row.status).toBe('queued')
    expect(row.attempts).toBe(0)
  })
})

describe('schedules', () => {
  it('fires each slot exactly once, even with overlapping ticks', async () => {
    const db = getDb()
    await db.insert(jobSchedules).values({ name: 'maintenance.purge', cron: '0 3 * * *', tz: 'Asia/Jakarta', enabled: true })
    const now = new Date('2026-10-15T20:05:00Z')
    const results = await Promise.all([fireDueSchedules(db, now), fireDueSchedules(db, now), fireDueSchedules(db, now)])
    expect(results.flat()).toEqual(['maintenance.purge'])
    expect(await fireDueSchedules(db, new Date('2026-10-15T21:00:00Z'))).toEqual([])
    expect(await fireDueSchedules(db, new Date('2026-10-16T20:00:01Z'))).toEqual(['maintenance.purge'])
    const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs)
    expect(count!.n).toBe(2)
  })

  it('a tick runs the fired job and writes the heartbeat', async () => {
    const ctx = testContext()
    await ctx.db.insert(jobSchedules).values({ name: 'maintenance.purge', cron: '* * * * *', tz: 'Asia/Jakarta', enabled: true })
    const summary = await runTick(ctx, { budgetMs: 40_000 })
    expect(summary.schedulesFired).toEqual(['maintenance.purge'])
    expect(summary.done).toBe(1)
    const beat = await ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from system_heartbeat where name = 'tick'`)
    expect(beat.rows[0]!.n).toBe(1)
  })
})

describe('kick budget', () => {
  it('runs a kicked job whose expectedMs is the default (regression: kick released it)', async () => {
    const ctx = testContext()
    const id = await enqueue(ctx.db, q('test.ok'), { n: 'kicked' })
    const summary = await kick(ctx, [id])
    expect(summary.done).toBe(1)
    expect(summary.released).toBe(0)
  })
})
