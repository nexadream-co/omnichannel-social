import { ideaListSchema, listIdeas } from '../../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return listIdeas(ctx, { ...parseListQuery(event), ...validatedQuery(event, ideaListSchema) })
})
