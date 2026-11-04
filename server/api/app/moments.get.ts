import { momentsQuerySchema, momentsSummary } from '../../core/moments'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return momentsSummary(ctx, validatedQuery(event, momentsQuerySchema))
})
