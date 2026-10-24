import { markAllNotificationsRead, readAllSchema } from '../../../core/notifications'

export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const { before } = parseOrThrow(readAllSchema, await readBody(event).catch(() => undefined) ?? {})
  return { updated: await markAllNotificationsRead(ctx.db, { audience: 'creator', userId: ctx.access.user.id, workspaceId: ctx.workspaceId }, before) }
})
