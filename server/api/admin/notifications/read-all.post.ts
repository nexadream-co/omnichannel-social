import { markAllNotificationsRead, readAllSchema } from '../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireStaffContext(event)
  const { before } = parseOrThrow(readAllSchema, await readBody(event).catch(() => undefined) ?? {})
  return { updated: await markAllNotificationsRead(ctx.db, { audience: 'staff', userId: ctx.staffUserId }, before) }
})
