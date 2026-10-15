import { env } from '../core/env'

const SHORT_PATHS = [/^\/r\//, /^\/bio\//, /^\/_nuxt\//, /^\/__nuxt/, /^\/favicon\.ico$/, /^\/robots\.txt$/]

/**
 * On SHORT_DOMAIN only short links, Etalase pages and static assets are served (docs/blueprint/19 §7).
 * In production a Cloudflare rewrite maps /@handle → /bio/handle and /slug → /r/slug before this runs;
 * when Cloudflare isn't in front (dev, previews) this middleware redirects to those paths as a fallback.
 */
export default defineEventHandler((event) => {
  const config = env()
  const shortHost = new URL(config.shortUrl).host
  if (shortHost === new URL(config.siteUrl).host) return
  if (getRequestHost(event, { xForwardedHost: true }) !== shortHost) return
  const path = event.path
  if (SHORT_PATHS.some(pattern => pattern.test(path))) return
  const handle = /^\/@([\w.-]+)\/?$/.exec(path)
  if (handle) return sendRedirect(event, `/bio/${handle[1]}`, 307)
  const slug = /^\/([0-9A-Za-z_-]{3,32})$/.exec(path) // SLUG_PATTERN
  if (slug) return sendRedirect(event, `/r/${slug[1]}`, 307)
  throw createError({ statusCode: 404 })
})
