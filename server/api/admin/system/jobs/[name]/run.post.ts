import { runJobNow } from '../../../../../core/jobs/manual'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'settings.write')
  return runJobNow(ctx, getRouterParam(event, 'name') ?? '')
})
