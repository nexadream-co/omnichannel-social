import { archiveIdea } from '../../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return archiveIdea(ctx, getRouterParam(event, 'id') ?? '')
})
