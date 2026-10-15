import { adminPaymentsQuery, listAdminPayments } from '../../../core/admin/billing'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'payments.read')
  return listAdminPayments(ctx, validatedQuery(event, adminPaymentsQuery))
})
