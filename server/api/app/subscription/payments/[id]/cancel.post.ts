import { cancelWorkspacePayment } from '../../../../../core/checkout'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return cancelWorkspacePayment(ctx, getRouterParam(event, 'id') ?? '')
})
