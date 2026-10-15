import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import type { Database } from '../db/client'
import { appError } from '../errors'
import { enqueue } from './enqueue'
import { handlers } from './handlers'
import type { QueueName } from './queues'
import { kick } from './runner'

/** "Jalankan sekarang" in /admin/system/jobs (docs/blueprint/15 §5). Every handler is idempotent, so an extra run is safe. */
export async function runJobNow(ctx: StaffContext, name: string) {
  assertPermission(ctx, 'settings.write')
  if (!handlers[name]) throw appError(404, 'Pekerjaan tidak ditemukan.', 'NOT_FOUND')
  const minute = new Date().toISOString().slice(0, 16)
  const jobId = await enqueue(ctx.db, name as QueueName, { manual: true, by: ctx.staffUserId }, { singletonKey: `manual:${minute}` })
  if (!jobId) throw appError(409, 'Pekerjaan ini baru saja dijalankan. Tunggu sebentar.', 'CONFLICT')
  await recordAudit(ctx, { audience: 'staff', action: 'system.job_run', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'job', targetId: jobId, metadata: { queue: name } })
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  return { jobId }
}
