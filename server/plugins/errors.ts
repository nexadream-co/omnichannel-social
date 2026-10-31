import { GENERIC_ERROR_MESSAGE } from '../core/errors'
import { log } from '../core/log'

/** Who was signed in when the request failed, so a support search by user or workspace finds it. */
function actorOf(context: Record<string, unknown> | undefined) {
  const creator = context?.workspaceContext as { userId?: string, workspaceId?: string } | undefined
  const staff = context?.staffContext as { staffUserId?: string } | undefined
  return { userId: creator?.userId, workspaceId: creator?.workspaceId, staffUserId: staff?.staffUserId }
}

/**
 * Unhandled errors never leak their message (docs/blueprint/12 §4): log the original, then replace the
 * text with the generic Bahasa sentence before the error handler renders it.
 * A 4xx from a signed-in user is logged as request.rejected, so their history in /admin/system/logs shows refusals too.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const h3 = error as { statusCode?: number, unhandled?: boolean, statusMessage?: string, message: string, data?: { code?: string } }
    const actor = actorOf(event?.context)
    if (!h3.unhandled && (h3.statusCode ?? 500) < 500) {
      if (actor.userId || actor.staffUserId) log.warn('request.rejected', { path: event?.path, statusCode: h3.statusCode, code: h3.data?.code, message: h3.statusMessage, ...actor })
      return
    }
    log.error('request.error', { path: event?.path, statusCode: h3.statusCode, error, ...actor })
    if (h3.unhandled && event?.path.startsWith('/api/')) {
      h3.statusMessage = GENERIC_ERROR_MESSAGE
      h3.message = GENERIC_ERROR_MESSAGE
      h3.data = { code: 'SERVER_ERROR' }
    }
  })
})
