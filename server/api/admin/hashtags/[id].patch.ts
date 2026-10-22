import { libraryTagPatchSchema, updateLibraryTag } from '../../../core/hashtags/library'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'hashtags.write')
  await updateLibraryTag(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, libraryTagPatchSchema))
  return { ok: true }
})
