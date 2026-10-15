import { deletePage } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'pages.write')
  await deletePage(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
