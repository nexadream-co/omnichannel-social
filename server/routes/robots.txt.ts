import { env } from '../core/env'

/** Per host (docs/blueprint/14 §6): the main site is crawlable except consoles; the short domain only exposes Etalase pages. */
export default defineEventHandler((event) => {
  const config = env()
  const host = getRequestHost(event, { xForwardedHost: true })
  const shortHost = new URL(config.shortUrl).host
  const siteHost = new URL(config.siteUrl).host
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  if (host === shortHost && shortHost !== siteHost) return 'User-agent: *\nAllow: /@\nDisallow: /\n'
  if (!config.isProduction) return 'User-agent: *\nDisallow: /\n' // staging and previews never get indexed
  return [
    'User-agent: *', 'Allow: /', 'Disallow: /app/', 'Disallow: /en/app/', 'Disallow: /admin/', 'Disallow: /api/', 'Disallow: /r/', 'Disallow: /legal/data-deletion',
    `Sitemap: ${config.siteUrl}/sitemap.xml`, ''
  ].join('\n')
})
