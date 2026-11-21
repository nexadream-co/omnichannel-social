import { listNews, newsQuerySchema } from '../../core/news/service'

/** Beranda "Lagi rame". Same for every workspace, so a short private cache is enough. */
export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const query = validatedQuery(event, newsQuerySchema)
  setResponseHeader(event, 'cache-control', 'private, max-age=300')
  return listNews(ctx, query)
})
