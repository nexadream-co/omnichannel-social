import { pageSchema, updatePage } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'pages.write')
  await updatePage(ctx, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, pageSchema.partial()))
  return { ok: true }
})
