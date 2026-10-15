import { updateBio, updateBioSchema } from '../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return { page: await updateBio(ctx, await readValidatedJson(event, updateBioSchema)) }
})
