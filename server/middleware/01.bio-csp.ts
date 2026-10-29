import { storage } from '../core/services/storage'

/**
 * Strict CSP on the public Etalase (docs/blueprint/14 §4). The page ships no JavaScript (routeRules noScripts),
 * so script-src 'self' holds. Images only from our media domain. Set per request so the media host comes from the storage driver (R2 media domain or Vercel Blob store).
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/bio/')) return
  const media = (() => {
    try {
      return new URL(storage().publicUrl('')).origin
    } catch {
      return ''
    }
  })()
  setResponseHeader(event, 'content-security-policy', `default-src 'self'; img-src 'self' ${media} data:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`)
})
