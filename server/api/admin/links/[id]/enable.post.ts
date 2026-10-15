import { setLinkActive } from '../../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'links.write')
  await setLinkActive(ctx, getRouterParam(event, 'id') ?? '', true)
  return { ok: true }
})
