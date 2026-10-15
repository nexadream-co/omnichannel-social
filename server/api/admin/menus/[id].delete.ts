import { deleteMenu } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'menus.write')
  await deleteMenu(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
