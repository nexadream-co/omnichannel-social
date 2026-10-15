import { listPaymentWebhookEvents, webhookEventsQuerySchema } from '../../../core/payment-webhooks'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'payments.read')
  return listPaymentWebhookEvents(ctx, validatedQuery(event, webhookEventsQuerySchema))
})
