import { GENERIC_ERROR_MESSAGE } from '../core/errors'
import { log } from '../core/log'

/**
 * Unhandled errors never leak their message (docs/blueprint/12 §4): log the original, then replace the
 * text with the generic Bahasa sentence before the error handler renders it.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const h3 = error as { statusCode?: number, unhandled?: boolean, statusMessage?: string, message: string, data?: unknown }
    if (!h3.unhandled && (h3.statusCode ?? 500) < 500) return
    log.error('request.error', { path: event?.path, statusCode: h3.statusCode, error })
    if (h3.unhandled && event?.path.startsWith('/api/')) {
      h3.statusMessage = GENERIC_ERROR_MESSAGE
      h3.message = GENERIC_ERROR_MESSAGE
      h3.data = { code: 'SERVER_ERROR' }
    }
  })
})
