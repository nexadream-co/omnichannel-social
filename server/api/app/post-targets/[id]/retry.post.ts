import type { Database } from '../../../../core/db/client'
import { kick } from '../../../../core/jobs'
import { retryTarget } from '../../../../core/publishing/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { jobId } = await retryTarget(ctx, getRouterParam(event, 'id') ?? '')
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  return { success: true }
})
