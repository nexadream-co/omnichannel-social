import type { Database } from '../../../../core/db/client'
import { kick } from '../../../../core/jobs'
import { createVideoEdit, videoEditSchema } from '../../../../core/media/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { jobId, ...result } = await createVideoEdit(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, videoEditSchema))
  if (jobId) ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  return result
})
