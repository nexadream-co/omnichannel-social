import { z } from 'zod'
import { impersonateCreator } from '../../../../core/admin/workspaces'

export default defineEventHandler(async (event) => {
  const ctx = await requireSuperAdmin(event)
  const { workspaceId } = await readValidatedJson(event, z.object({ workspaceId: z.string().optional() }))
  const { setCookie } = await impersonateCreator(ctx, { userId: getRouterParam(event, 'id') ?? '', workspaceId })
  appendResponseHeader(event, 'set-cookie', setCookie)
  return { redirect: '/app' }
})
