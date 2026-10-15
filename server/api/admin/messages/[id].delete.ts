import { deleteMessage } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'messages.write')
  await deleteMessage(ctx, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
