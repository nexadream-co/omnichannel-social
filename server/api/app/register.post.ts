import { registerCreator, registrationSchema } from '../../core/registration'
import { creatorSignUp } from '../../core/services/auth'
import { runInRequestScope } from '../../core/request-scope'

export default defineEventHandler(async (event) => {
  const ctx = requestContext(event)
  const body = await readValidatedJson(event, registrationSchema)
  const headers = new Headers(getRequestHeaders(event) as Record<string, string>)
  const result = await runInRequestScope({ defer: ctx.defer }, () => registerCreator(ctx, body, headers, creatorSignUp))
  for (const cookie of result.setCookie) appendResponseHeader(event, 'set-cookie', cookie)
  return { success: true }
})
