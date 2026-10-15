import { listStaff, usersQuery } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'staff.read')
  return listStaff(ctx, validatedQuery(event, usersQuery))
})
