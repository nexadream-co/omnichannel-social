import { retryPublishFailure } from '../../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'publishing.write')
  await retryPublishFailure(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
