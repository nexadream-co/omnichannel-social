import { getWorkspaceDetail } from '../../../../core/admin/workspaces'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'workspaces.read')
  return getWorkspaceDetail(ctx, getRouterParam(event, 'id') ?? '')
})
