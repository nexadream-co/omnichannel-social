import { auditQuery, listAuditLogs } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'settings.read')
  return listAuditLogs(ctx, validatedQuery(event, auditQuery))
})
