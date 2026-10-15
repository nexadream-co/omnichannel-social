import { retryDeadJob } from '../../../../../../core/admin/overview'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'settings.write')
  await retryDeadJob(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
