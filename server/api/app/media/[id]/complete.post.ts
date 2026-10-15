import type { Database } from '../../../../core/db/client'
import { kick } from '../../../../core/jobs'
import { completeMediaUpload, getMedia } from '../../../../core/media/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const id = getRouterParam(event, 'id') ?? ''
  const { jobId } = await completeMediaUpload(ctx, id)
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  return getMedia(ctx, id)
})
