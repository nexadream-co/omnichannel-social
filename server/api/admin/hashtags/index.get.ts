import { libraryQuerySchema, listLibrary } from '../../../core/hashtags/library'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'hashtags.read')
  return listLibrary(ctx, validatedQuery(event, libraryQuerySchema))
})
