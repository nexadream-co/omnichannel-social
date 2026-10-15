import type { Database } from '../../../core/db/client'
import { kick } from '../../../core/jobs'
import { createPost, postInputSchema } from '../../../core/publishing/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const result = await createPost(ctx, await readValidatedJson(event, postInputSchema))
  // "Posting sekarang" can't wait for the next tick (docs/blueprint/15 §1.4).
  if (result.kick) ctx.defer(kick({ ...ctx, db: ctx.db as Database }, result.jobIds))
  return { postId: result.postId }
})
