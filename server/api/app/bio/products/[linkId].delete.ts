import { getMyBio, removeProduct } from '../../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  await removeProduct(ctx, getRouterParam(event, 'linkId') ?? '')
  return { page: await getMyBio(ctx) }
})
