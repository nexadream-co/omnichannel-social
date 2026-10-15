import { z } from 'zod'
import { addProduct, getMyBio } from '../../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { linkId } = await readValidatedJson(event, z.object({ linkId: z.string() }))
  await addProduct(ctx, linkId)
  return { page: await getMyBio(ctx) }
})
