import { createBio, createBioSchema } from '../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return { page: await createBio(ctx, await readValidatedJson(event, createBioSchema)) }
})
