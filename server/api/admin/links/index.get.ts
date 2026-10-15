import { linksQuery, listShortLinksAdmin } from '../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'links.read')
  return listShortLinksAdmin(ctx, validatedQuery(event, linksQuery))
})
