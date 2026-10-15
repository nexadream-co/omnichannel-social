import { listWorkspaces, workspaceListQuery } from '../../../core/admin/workspaces'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'workspaces.read')
  return listWorkspaces(ctx, validatedQuery(event, workspaceListQuery))
})
