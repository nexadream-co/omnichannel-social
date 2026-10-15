import { receivePaymentWebhook } from '../../../core/payment-webhooks'

/** No session middleware: the driver decides what makes a callback trustworthy (docs/blueprint/08 §6). */
export default defineEventHandler(async (event) => {
  const payload = await readBody(event).catch(() => null)
  if (!payload || typeof payload !== 'object') throw createError({ statusCode: 400 })
  return receivePaymentWebhook(requestContext(event), getRouterParam(event, 'provider') ?? '', payload as Record<string, unknown>, getRequestHeaders(event))
})
