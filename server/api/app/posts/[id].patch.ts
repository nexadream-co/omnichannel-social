import type { Database } from '../../../core/db/client'
import { kick } from '../../../core/jobs'
import { postInputSchema, updatePost } from '../../../core/publishing/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const result = await updatePost(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, postInputSchema))
  if (result.kick) ctx.defer(kick({ ...ctx, db: ctx.db as Database }, result.jobIds))
  return { postId: result.postId }
})
