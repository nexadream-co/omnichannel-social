import { failuresQuery, listPublishFailures } from '../../../core/admin/operations'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'publishing.read')
  return listPublishFailures(ctx, validatedQuery(event, failuresQuery))
})
