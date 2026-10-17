import { outcomeSchema, simulateOutcome } from '../../../../core/payment-simulator'

export default defineEventHandler(async (event) => {
  const ctx = requestContext(event)
  return simulateOutcome(ctx, getRouterParam(event, 'orderId') ?? '', await readValidatedJson(event, outcomeSchema))
})
