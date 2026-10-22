import { menuPatchSchema, updateMenu } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'menus.write')
  await updateMenu(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, menuPatchSchema))
  return { ok: true }
})
