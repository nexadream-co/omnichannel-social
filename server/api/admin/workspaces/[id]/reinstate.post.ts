import { reinstateWorkspace } from '../../../../core/admin/workspaces'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'workspaces.write')
  return reinstateWorkspace(ctx, getRouterParam(event, 'id') ?? '')
})
