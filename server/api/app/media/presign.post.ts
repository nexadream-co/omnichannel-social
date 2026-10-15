import { presignMediaUpload, presignSchema } from '../../../core/media/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return presignMediaUpload(ctx, await readValidatedJson(event, presignSchema))
})
