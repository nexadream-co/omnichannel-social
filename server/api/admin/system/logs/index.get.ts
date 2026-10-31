import { appLogsQuery, listAppLogs } from '../../../../core/admin/logs'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'logs.read')
  return listAppLogs(ctx, validatedQuery(event, appLogsQuery))
})
