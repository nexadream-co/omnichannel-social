import { ideaPatchSchema, updateIdea } from '../../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updateIdea(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, ideaPatchSchema))
})
