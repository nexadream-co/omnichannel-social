import type { Database } from '../../../core/db/client'
import { kick } from '../../../core/jobs'
import { deleteMedia } from '../../../core/media/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { jobId } = await deleteMedia(ctx, getRouterParam(event, 'id') ?? '')
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [jobId]))
  return { deleted: true }
})
