import { remindReconnect } from '../../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'publishing.write')
  await remindReconnect(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
