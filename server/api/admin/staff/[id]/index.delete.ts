import { updateStaff } from '../../../../core/admin/people'

/** Delete = deactivate: isActive false and every staff session revoked. */
export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'staff.write')
  await updateStaff(ctx, getRouterParam(event, 'id') ?? '', { isActive: false })
  return { ok: true }
})
