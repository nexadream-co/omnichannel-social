import { createHashtagSet, hashtagSetSchema } from '../../../core/hashtags/sets'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return createHashtagSet(ctx, await readValidatedJson(event, hashtagSetSchema))
})
