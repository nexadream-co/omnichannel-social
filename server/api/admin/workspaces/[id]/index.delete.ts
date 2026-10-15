import { deleteWorkspace } from '../../../../core/admin/workspaces'

export default defineEventHandler(async (event) => {
  const ctx = await requireSuperAdmin(event)
  await deleteWorkspace(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
