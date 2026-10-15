import { recordAudit } from '../../../core/audit'
import { readSession, restoreStaffSessionCookies, revokeSession } from '../../../core/services/auth'

/** Ends staff-to-staff impersonation and puts the operator's own session back. */
export default defineEventHandler(async (event) => {
  const cookieHeader = getRequestHeader(event, 'cookie') ?? ''
  const session = await readSession(new Headers({ cookie: cookieHeader }), 'staff')
  if (!session?.impersonatedBy) throw createError({ statusCode: 400, statusMessage: 'Anda tidak sedang menyamar.' })
  await revokeSession(session.sessionId, 'staff')
  for (const cookie of await restoreStaffSessionCookies(cookieHeader)) appendResponseHeader(event, 'set-cookie', cookie)
  await recordAudit(requestContext(event), { audience: 'staff', action: 'staff.impersonate_stop', actorId: session.impersonatedBy, targetType: 'staff_user', targetId: session.userId })
  return { redirect: '/admin/staff' }
})
