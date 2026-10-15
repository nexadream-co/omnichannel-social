import { markAllNotificationsRead } from '../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireStaffContext(event)
  return { updated: await markAllNotificationsRead(ctx.db, { audience: 'staff', userId: ctx.staffUserId }) }
})
