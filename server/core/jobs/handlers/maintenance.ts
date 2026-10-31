import { sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { getSettingNumber } from '../../settings'
import type { JobHandler } from '../types'

const BATCH = 5_000
const MAX_PASSES = 20

/** Deletes in batches through an id subquery so no single statement holds long locks. */
async function purgeBatched(db: Database, table: string, idColumn: string, where: string): Promise<number> {
  let total = 0
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = await db.execute(sql.raw(`delete from ${table} where ${idColumn} in (select ${idColumn} from ${table} where ${where} limit ${BATCH})`))
    const count = result.rowCount ?? 0
    total += count
    if (count < BATCH) break
  }
  return total
}

/** docs/blueprint/15 §3.5. Each step in its own try/catch; one failure never stops the rest. */
export const purge: JobHandler = async (_job, ctx) => {
  const db = ctx.db as Database
  const commentDays = Math.max(1, Math.trunc(await getSettingNumber('privacy.commentTextRetentionDays', 30)))
  const steps: [string, () => Promise<number>][] = [
    ['webhook_events', () => purgeBatched(db, 'webhook_events', 'id', `received_at < now() - interval '14 days'`)],
    ['app_logs', () => purgeBatched(db, 'app_logs', 'id', `created_at < now() - interval '30 days'`)],
    ['payment_webhook_events', () => purgeBatched(db, 'payment_webhook_events', 'id', `created_at < now() - interval '180 days'`)],
    ['jobs_finished', () => purgeBatched(db, 'jobs', 'id', `status in ('done', 'cancelled') and finished_at < now() - interval '7 days'`)],
    ['jobs_dead', () => purgeBatched(db, 'jobs', 'id', `status = 'dead' and finished_at < now() - interval '30 days'`)],
    ['ip_salts', async () => (await db.execute(sql`delete from ip_salts where created_at < now() - interval '2 days'`)).rowCount ?? 0],
    ['rate_limit_buckets', async () => (await db.execute(sql`delete from rate_limit_buckets where expires_at < now()`)).rowCount ?? 0],
    ['dm_comment_text', async () => (await db.execute(sql.raw(`update dm_events set comment_text = null where comment_text is not null and created_at < now() - interval '${commentDays} days'`))).rowCount ?? 0],
    ['sessions', () => purgeBatched(db, 'sessions', 'id', 'expires_at < now()')],
    ['staff_sessions', () => purgeBatched(db, 'staff_sessions', 'id', 'expires_at < now()')],
    ['verifications', () => purgeBatched(db, 'verifications', 'id', 'expires_at < now()')],
    ['staff_verifications', () => purgeBatched(db, 'staff_verifications', 'id', 'expires_at < now()')],
    ['workspace_invitations', () => purgeBatched(db, 'workspace_invitations', 'id', `accepted_at is null and expires_at < now() - interval '30 days'`)],
    ['staff_invitations', () => purgeBatched(db, 'staff_invitations', 'id', `accepted_at is null and expires_at < now() - interval '30 days'`)]
  ]
  const result: Record<string, number | string> = {}
  for (const [name, step] of steps) {
    try {
      result[name] = await step()
    } catch (error) {
      result[name] = 'failed'
      ctx.log.error('maintenance.purge_step_failed', { step: name, error })
    }
  }
  ctx.log.info('maintenance.purge_done', result)
}
