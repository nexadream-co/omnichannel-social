import { recentMedia } from '../../../core/autoreply/rules'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return { items: await recentMedia(ctx, String(getQuery(event).accountId ?? '')) }
})
