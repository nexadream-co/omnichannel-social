import { creatorProfileSchema, updateCreatorProfile } from '../../core/account'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return updateCreatorProfile(ctx, await readValidatedJson(event, creatorProfileSchema))
})
