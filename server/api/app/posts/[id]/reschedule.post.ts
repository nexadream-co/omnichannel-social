import { z } from 'zod'
import { reschedulePost } from '../../../../core/publishing/service'

const schema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) })

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { scheduledAt } = await readValidatedJson(event, schema)
  return reschedulePost(ctx, getRouterParam(event, 'id') ?? '', scheduledAt).then(r => ({ postId: r.postId }))
})
