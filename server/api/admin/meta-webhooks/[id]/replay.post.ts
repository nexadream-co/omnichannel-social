import { replayMetaWebhook } from '../../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'channels.write')
  await replayMetaWebhook(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
