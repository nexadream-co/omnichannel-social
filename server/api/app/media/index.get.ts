import { listMedia } from '../../../core/media/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const query = getQuery(event)
  const kind = query.kind === 'image' || query.kind === 'video' ? query.kind : null
  return listMedia(ctx, { ...parseListQuery(event), kind, readyOnly: query.ready === 'true' })
})
