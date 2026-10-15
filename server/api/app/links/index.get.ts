import { linkListSchema, listLinks } from '../../../core/links/service'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return listLinks(ctx, { ...parseListQuery(event), ...validatedQuery(event, linkListSchema), all: getQuery(event).all === 'true' })
})
