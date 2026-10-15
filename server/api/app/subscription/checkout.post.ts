import { checkoutSchema, startCheckout } from '../../../core/checkout'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return startCheckout(ctx, await readValidatedJson(event, checkoutSchema))
})
