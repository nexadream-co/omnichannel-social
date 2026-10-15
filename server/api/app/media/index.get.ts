import { listMedia } from '../../../core/media/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return listMedia(ctx, parseListQuery(event))
})
