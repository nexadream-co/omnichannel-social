import { createIdeasFromMedia, fromMediaSchema } from '../../../../core/planner/shortcuts'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return createIdeasFromMedia(ctx, await readValidatedJson(event, fromMediaSchema))
})
