import { listCreatorUsers, usersQuery } from '../../../core/admin/people'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'workspaces.read')
  return listCreatorUsers(ctx, validatedQuery(event, usersQuery))
})
