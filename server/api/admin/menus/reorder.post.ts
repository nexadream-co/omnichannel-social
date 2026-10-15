import { z } from 'zod'
import { reorderMenus } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'menus.write')
  const { ids } = await readValidatedJson(event, z.object({ ids: z.array(z.string()).max(200) }))
  await reorderMenus(ctx, ids)
  return { ok: true }
})
