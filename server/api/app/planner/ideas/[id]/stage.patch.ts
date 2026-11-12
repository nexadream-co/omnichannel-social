import { ideaStageSchema, moveIdeaStage } from '../../../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return moveIdeaStage(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, ideaStageSchema))
})
