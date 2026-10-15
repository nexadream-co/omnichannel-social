import { cancelSubscription } from '../../../core/subscriptions'

export default defineEventHandler(async (event) => {
  await cancelSubscription(await requireWorkspaceContext(event))
  return { ok: true }
})
