import { appError } from '../../../core/errors'
import { IMPERSONATION_BLOCKED_AUTH_PATHS, handleAuthRequest, readSession } from '../../../core/services/auth'
import { runInRequestScope } from '../../../core/request-scope'

export default defineEventHandler(async (event) => {
  // An impersonated session never changes the owner's credentials or identity (docs/blueprint/03 §10).
  if (IMPERSONATION_BLOCKED_AUTH_PATHS.some(path => event.path.split('?')[0]!.endsWith(path))) {
    const session = await readSession(new Headers(getRequestHeaders(event) as Record<string, string>), 'staff')
    if (session?.impersonatedBy) throw appError(403, 'Tindakan ini tidak bisa dilakukan saat menyamar sebagai pengguna.', 'FORBIDDEN')
  }
  return runInRequestScope({ defer: work => event.waitUntil(work) }, () => handleAuthRequest('staff', toWebRequest(event)))
})
