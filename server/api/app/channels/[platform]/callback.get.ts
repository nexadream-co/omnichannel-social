import { isPlatform } from '../../../../../shared/channels/registry'
import { handleConnectCallback, OAUTH_STATE_COOKIE } from '../../../../core/social-accounts'

export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, 'platform') ?? ''
  const cookie = getCookie(event, OAUTH_STATE_COOKIE)
  deleteCookie(event, OAUTH_STATE_COOKIE, { path: '/api/app/channels' })
  try {
    if (!isPlatform(platform)) throw createError({ statusCode: 404, data: { reason: 'unknown_platform' } })
    const ctx = await requireWorkspaceContext(event)
    requireNotImpersonating(ctx)
    const query = getQuery(event)
    const result = await handleConnectCallback(ctx, platform, {
      code: typeof query.code === 'string' ? query.code : undefined,
      state: typeof query.state === 'string' ? query.state : undefined,
      error: typeof query.error === 'string' ? query.error : undefined
    }, cookie)
    return sendRedirect(event, accountsPath(event, result.kind === 'pick' ? `/pick?session=${result.sessionId}` : `?connected=${result.count}&platform=${platform}`), 302)
  } catch (error) {
    return sendRedirect(event, accountsPath(event, `?error=${encodeURIComponent(errorReason(error))}&platform=${platform}`), 302)
  }
})
