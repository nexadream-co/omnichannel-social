import { impersonateCreator } from '../../../../core/admin/workspaces'

/** Opens /app as the owner: the creator session cookie is set on this browser (docs/blueprint/03 §10). */
export default defineEventHandler(async (event) => {
  const ctx = await requireSuperAdmin(event)
  const { setCookie } = await impersonateCreator(ctx, { workspaceId: getRouterParam(event, 'id') ?? '' })
  appendResponseHeader(event, 'set-cookie', setCookie)
  return { redirect: '/app' }
})
