import { itemPatchSchema, updateItem } from '../../../../core/bio/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return { page: await updateItem(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, itemPatchSchema)) }
})
