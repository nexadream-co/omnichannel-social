import { getPageForEdit } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'pages.read')
  return getPageForEdit(ctx, getRouterParam(event, 'id') ?? '')
})
