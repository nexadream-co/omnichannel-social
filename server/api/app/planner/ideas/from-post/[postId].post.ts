import { fromPostSchema, ideaFromPost } from '../../../../../core/planner/shortcuts'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return ideaFromPost(ctx, getRouterParam(event, 'postId') ?? '', await readValidatedJson(event, fromPostSchema))
})
