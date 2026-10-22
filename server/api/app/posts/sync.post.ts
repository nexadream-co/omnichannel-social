import type { Database } from '../../../core/db/client'
import { startWorkspaceSync } from '../../../core/engagement-jobs'
import { kick } from '../../../core/jobs'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { jobId } = await startWorkspaceSync(ctx)
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  return { success: true }
})
