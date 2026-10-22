import { researchSchema, researchTags } from '../../../core/hashtags/research'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return researchTags(ctx, await readValidatedJson(event, researchSchema))
})
