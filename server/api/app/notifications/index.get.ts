import { listNotifications } from '../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return listNotifications(ctx.db, { audience: 'creator', userId: ctx.access.user.id, workspaceId: ctx.workspaceId }, {
    ...parseListQuery(event),
    unreadOnly: getQuery(event).unreadOnly === 'true'
  })
})
