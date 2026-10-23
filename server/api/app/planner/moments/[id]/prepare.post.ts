import { prepareMoment, prepareMomentSchema } from '../../../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return prepareMoment(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, prepareMomentSchema))
})
