import { refreshSocialAccountAdmin } from '../../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'channels.write')
  await refreshSocialAccountAdmin(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
