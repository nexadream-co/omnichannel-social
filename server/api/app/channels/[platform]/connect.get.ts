import { isPlatform } from '../../../../../shared/channels/registry'
import { OAUTH_STATE_COOKIE, startConnect } from '../../../../core/social-accounts'

/** Browser navigation: on success 302 to the platform; on failure back to the accounts page with a reason. */
export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, 'platform') ?? ''
  setCookie(event, 'socialz_oauth_return', getQuery(event).return === '/en/app/accounts' ? '/en/app/accounts' : '/app/accounts', { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, maxAge: 900, path: '/' })
  try {
    if (!isPlatform(platform)) throw createError({ statusCode: 404, data: { reason: 'unknown_platform' } })
    const ctx = await requireWorkspaceContext(event)
    requireNotImpersonating(ctx)
    const { url, cookie } = await startConnect({ ...ctx, emailVerified: ctx.access.user.emailVerified }, platform)
    setCookie(event, OAUTH_STATE_COOKIE, cookie, { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, maxAge: 900, path: '/api/app/channels' })
    return sendRedirect(event, url, 302)
  } catch (error) {
    return sendRedirect(event, accountsPath(event, `?error=${encodeURIComponent(errorReason(error))}`), 302)
  }
})
