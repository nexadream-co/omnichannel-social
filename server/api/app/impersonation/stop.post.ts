import { recordAudit } from '../../../core/audit'
import { clearedCreatorSessionCookie, readSession, revokeSession } from '../../../core/services/auth'

/** "Berhenti menyamar": ends the impersonation session and returns staff to the workspace page. */
export default defineEventHandler(async (event) => {
  const session = await readSession(new Headers(getRequestHeaders(event) as Record<string, string>), 'creator')
  if (!session?.impersonatedBy) throw createError({ statusCode: 409, statusMessage: 'Kamu tidak sedang menyamar.' })
  await revokeSession(session.sessionId, 'creator')
  appendResponseHeader(event, 'set-cookie', await clearedCreatorSessionCookie())
  const ctx = requestContext(event)
  await recordAudit(ctx, { audience: 'staff', action: 'user.impersonate_stop', actorId: session.impersonatedBy, workspaceId: session.activeWorkspaceId, targetType: 'user', targetId: session.userId })
  return { redirect: session.activeWorkspaceId ? `/admin/workspaces/${session.activeWorkspaceId}` : '/admin/workspaces' }
})
