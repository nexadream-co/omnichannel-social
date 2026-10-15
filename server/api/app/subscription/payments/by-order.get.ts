import { getWorkspacePayment } from '../../../../core/subscriptions'

/** The billing page's return check: the payment's own status, never the redirect URL. */
export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return getWorkspacePayment(ctx, String(getQuery(event).orderId ?? ''))
})
