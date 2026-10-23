import { createIdea, ideaSchema } from '../../../../core/planner/ideas'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return createIdea(ctx, await readValidatedJson(event, ideaSchema))
})
