import { markAllNotificationsRead } from '../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  return { updated: await markAllNotificationsRead(ctx.db, { audience: 'creator', userId: ctx.access.user.id, workspaceId: ctx.workspaceId }) }
})
