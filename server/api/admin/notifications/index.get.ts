import { listNotifications } from '../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireStaffContext(event)
  return listNotifications(ctx.db, { audience: 'staff', userId: ctx.staffUserId }, {
    ...parseListQuery(event),
    unreadOnly: getQuery(event).unreadOnly === 'true'
  })
})
