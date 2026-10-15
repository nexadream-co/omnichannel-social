import { adminReports, reportsQuery } from '../../../core/admin/overview'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'reports.read')
  return adminReports(ctx, validatedQuery(event, reportsQuery))
})
