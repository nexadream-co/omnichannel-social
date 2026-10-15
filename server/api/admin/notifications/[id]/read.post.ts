import { markNotificationRead } from '../../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireStaffContext(event)
  await markNotificationRead(ctx.db, { audience: 'staff', userId: ctx.staffUserId }, getRouterParam(event, 'id') ?? '')
  return { success: true }
})
