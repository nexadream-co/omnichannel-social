import { creatorSignUp } from '../../../core/services/auth'
import { runInRequestScope } from '../../../core/request-scope'
import { acceptInvitation, acceptSchema } from '../../../core/team'

/** Public: the invitee may have no account yet. Authenticated by the emailed token. */
export default defineEventHandler(async (event) => {
  const ctx = requestContext(event)
  const body = await readValidatedJson(event, acceptSchema)
  const headers = new Headers(getRequestHeaders(event) as Record<string, string>)
  const result = await runInRequestScope({ defer: ctx.defer }, () => acceptInvitation(ctx, body, headers, creatorSignUp))
  for (const cookie of result.setCookie) appendResponseHeader(event, 'set-cookie', cookie)
  return { signInRequired: result.signInRequired, email: result.email }
})
