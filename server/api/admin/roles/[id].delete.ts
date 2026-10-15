import { deleteRole } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'roles.write')
  await deleteRole(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
