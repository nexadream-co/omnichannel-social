import { replayPaymentWebhook } from '../../../../core/payment-webhooks'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'payments.write')
  return replayPaymentWebhook(ctx, getRouterParam(event, 'id') ?? '')
})
