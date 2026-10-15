import { menuSchema, updateMenu } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'menus.write')
  await updateMenu(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, menuSchema.partial()))
  return { ok: true }
})
