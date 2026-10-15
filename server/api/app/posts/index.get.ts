import { listPosts, postListQuerySchema } from '../../../core/publishing/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return listPosts(ctx, { ...parseListQuery(event), ...validatedQuery(event, postListQuerySchema) })
})
