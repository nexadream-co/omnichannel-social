import { analyticsQuerySchema, workspaceAnalytics } from '../../../core/analytics/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return workspaceAnalytics(ctx, validatedQuery(event, analyticsQuerySchema))
})
