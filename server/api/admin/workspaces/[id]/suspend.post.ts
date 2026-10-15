import { suspendSchema, suspendWorkspace } from '../../../../core/admin/workspaces'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'workspaces.write')
  const { reason } = await readValidatedJson(event, suspendSchema)
  await suspendWorkspace(ctx, getRouterParam(event, 'id') ?? '', reason)
  return { ok: true }
})
