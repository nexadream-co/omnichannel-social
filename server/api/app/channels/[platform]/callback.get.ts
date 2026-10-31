import { isPlatform } from '../../../../../shared/channels/registry'
import type { CoreContext } from '../../../../core/context'
import { handleConnectCallback, OAUTH_STATE_COOKIE } from '../../../../core/social-accounts'

export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, 'platform') ?? ''
  const cookie = getCookie(event, OAUTH_STATE_COOKIE)
  deleteCookie(event, OAUTH_STATE_COOKIE, { path: '/api/app/channels' })
  const query = getQuery(event)
  try {
    if (!isPlatform(platform)) throw createError({ statusCode: 404, data: { reason: 'unknown_platform' } })
    const ctx = await requireWorkspaceContext(event)
    requireNotImpersonating(ctx)
    const result = await handleConnectCallback(ctx, platform, {
      code: typeof query.code === 'string' ? query.code : undefined,
      state: typeof query.state === 'string' ? query.state : undefined,
      error: typeof query.error === 'string' ? query.error : undefined
    }, cookie)
    return sendRedirect(event, accountsPath(event, result.kind === 'pick' ? `/pick?session=${result.sessionId}` : `?connected=${result.count}&platform=${platform}`), 302)
  } catch (error) {
    // The redirect hides the failure from the error hook, so log it here, with the platform's own denial reason when it sent one.
    const logger = (event.context.workspaceContext as CoreContext | undefined)?.log ?? requestContext(event).log
    const failure = error as { statusCode?: number, message?: string, data?: { code?: string } }
    logger.warn('channels.connect_failed', {
      platform,
      reason: errorReason(error),
      statusCode: failure.statusCode,
      code: failure.data?.code,
      message: failure.message,
      error: failure.statusCode ? undefined : error,
      platformError: typeof query.error === 'string' ? query.error : undefined,
      platformErrorReason: typeof query.error_reason === 'string' ? query.error_reason : undefined,
      platformErrorDescription: typeof query.error_description === 'string' ? query.error_description : undefined,
      hasCode: typeof query.code === 'string',
      stateMatches: Boolean(cookie) && cookie === `${platform}.${String(query.state ?? '')}`
    })
    return sendRedirect(event, accountsPath(event, `?error=${encodeURIComponent(errorReason(error))}&platform=${platform}`), 302)
  }
})
