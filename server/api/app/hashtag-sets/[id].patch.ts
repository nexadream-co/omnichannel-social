import { hashtagSetSchema, updateHashtagSet } from '../../../core/hashtags/sets'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updateHashtagSet(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, hashtagSetSchema.partial()))
})
