import { adminSubscriptionsQuery, listAdminSubscriptions } from '../../../core/admin/billing'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'subscriptions.read')
  return listAdminSubscriptions(ctx, validatedQuery(event, adminSubscriptionsQuery))
})
