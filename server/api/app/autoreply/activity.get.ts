import { activityQuerySchema, listActivity } from '../../../core/autoreply/rules'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return listActivity(ctx, validatedQuery(event, activityQuerySchema))
})
