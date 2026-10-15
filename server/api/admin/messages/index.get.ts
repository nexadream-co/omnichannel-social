import { listMessages, messagesQuery } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'messages.read')
  return listMessages(ctx, validatedQuery(event, messagesQuery))
})
