import { markNotificationRead } from '../../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  await markNotificationRead(ctx.db, { audience: 'creator', userId: ctx.access.user.id, workspaceId: ctx.workspaceId }, getRouterParam(event, 'id') ?? '')
  return { success: true }
})
