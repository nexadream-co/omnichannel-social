import { receivePaymentWebhook } from '../../core/payment-webhooks'

/**
 * Nexadream Payment Hub callback at the address registered with the hub admin. Same receiver as
 * POST /api/webhooks/payments/nexadream_hub (docs/blueprint/08 §5.6, §6): the hub driver never trusts
 * the payload and re-reads the status.
 */
export default defineEventHandler(async (event) => {
  const payload = await readBody(event).catch(() => null)
  if (!payload || typeof payload !== 'object') throw createError({ statusCode: 400 })
  return receivePaymentWebhook(requestContext(event), 'nexadream_hub', payload as Record<string, unknown>, getRequestHeaders(event))
})
