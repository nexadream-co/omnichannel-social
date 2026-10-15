import { resumeSubscription } from '../../../core/subscriptions'

export default defineEventHandler(async (event) => {
  await resumeSubscription(await requireWorkspaceContext(event))
  return { ok: true }
})
