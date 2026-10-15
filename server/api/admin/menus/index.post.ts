import { createMenu, menuSchema } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'menus.write')
  await createMenu(ctx, await readValidatedJson(event, menuSchema))
  return { ok: true }
})
