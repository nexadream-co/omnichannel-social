import { analyticsQuerySchema, linkAnalytics } from '../../../../core/analytics/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return linkAnalytics(ctx, getRouterParam(event, 'id') ?? '', validatedQuery(event, analyticsQuerySchema))
})
