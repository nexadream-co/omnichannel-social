import { createPage, pageSchema } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'pages.write')
  return createPage(ctx, await readValidatedJson(event, pageSchema))
})
