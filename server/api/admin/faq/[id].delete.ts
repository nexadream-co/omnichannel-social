import { deleteFaq } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'faq.write')
  await deleteFaq(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
