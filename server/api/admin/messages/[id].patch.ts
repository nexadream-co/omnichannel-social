import { z } from 'zod'
import { updateMessageStatus } from '../../../core/admin/content'

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'messages.write')
  const { status } = await readValidatedJson(event, z.object({ status: z.enum(['new', 'read', 'replied', 'archived']) }))
  await updateMessageStatus(ctx, getRouterParam(event, 'id') ?? '', status)
  return { ok: true }
})
