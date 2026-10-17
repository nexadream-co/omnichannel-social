import { shiftTestClock, testClockSchema } from '../../../../core/admin/workspaces'

/** Test mode only: 404 in production. */
export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'subscriptions.write')
  const { action } = await readValidatedJson(event, testClockSchema)
  return shiftTestClock(ctx, getRouterParam(event, 'id') ?? '', action)
})
