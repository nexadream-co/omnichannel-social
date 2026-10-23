import { getIdea } from '../../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return getIdea(ctx, getRouterParam(event, 'id') ?? '')
})
