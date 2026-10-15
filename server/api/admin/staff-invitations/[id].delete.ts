import { revokeStaffInvitation } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'staff.write')
  await revokeStaffInvitation(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
