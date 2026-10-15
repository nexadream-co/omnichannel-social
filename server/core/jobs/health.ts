import { sql } from 'drizzle-orm'
import type { Database } from '../db/client'

export interface Health {
  ok: boolean
  db: boolean
  tickAgeSeconds: number | null
  oldestDueJobSeconds: number | null
  mediaProcessorAgeSeconds: number | null
}

const TICK_STALE_SECONDS = 180
const DUE_JOB_STALE_SECONDS = 300

/** /healthz: DB ping, last tick age, oldest due job age (docs/blueprint/15 §1.6). */
export async function checkHealth(db: Database): Promise<Health> {
  try {
    const result = await db.execute<{ tick: number | null, media: number | null, oldest: number | null }>(sql`
      select
        (select extract(epoch from now() - beat_at)::int from system_heartbeat where name = 'tick') as tick,
        (select extract(epoch from now() - beat_at)::int from system_heartbeat where name = 'media_processor') as media,
        (select extract(epoch from now() - min(run_at))::int from jobs where status = 'queued' and run_at <= now()) as oldest`)
    const row = result.rows[0] ?? { tick: null, media: null, oldest: null }
    const tickAgeSeconds = row.tick === null ? null : Number(row.tick)
    const oldestDueJobSeconds = row.oldest === null ? null : Number(row.oldest)
    const ok = tickAgeSeconds !== null && tickAgeSeconds <= TICK_STALE_SECONDS
      && (oldestDueJobSeconds === null || oldestDueJobSeconds <= DUE_JOB_STALE_SECONDS)
    return { ok, db: true, tickAgeSeconds, oldestDueJobSeconds, mediaProcessorAgeSeconds: row.media === null ? null : Number(row.media) }
  } catch {
    return { ok: false, db: false, tickAgeSeconds: null, oldestDueJobSeconds: null, mediaProcessorAgeSeconds: null }
  }
}
