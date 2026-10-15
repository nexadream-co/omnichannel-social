import { getDb } from '../../core/db/client'
import { env } from '../../core/env'
import { recordClick, resolveSlug } from '../../core/links/clicks'
import { clientIpFromHeaders } from '../../core/rate-limit'

const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

/** Tiny, dependency-free page: followers hit this on mobile data, so it must be instant. */
function notFoundPage(handle: string | null) {
  const back = handle ? `<p><a href="${escape(`${env().shortUrl}/@${handle}`)}">Lihat Etalase @${escape(handle)}</a></p>` : ''
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link tidak ditemukan</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa;color:#18181b;text-align:center;padding:24px}a{color:#e6114f;font-weight:600}@media(prefers-color-scheme:dark){body{background:#18181b;color:#fafafa}}</style></head>
<body><main><h1 style="font-size:20px">Link tidak ditemukan</h1><p>Link ini sudah tidak aktif atau salah ketik.</p>${back}</main></body></html>`
}

/** SHORT_DOMAIN/{slug} → 302 to the affiliate URL (ARCHITECTURE §10.1). No framing, no interstitial. */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const db = getDb()
  const resolved = /^[0-9A-Za-z_-]{3,32}$/.test(slug) ? await resolveSlug(db, slug) : null
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'x-robots-tag', 'noindex')
  if (!resolved?.destinationUrl) {
    setResponseStatus(event, 404)
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    return notFoundPage(resolved?.bioHandle ?? null)
  }
  const headers = new Headers(getRequestHeaders(event) as Record<string, string>)
  // Clicks are always recorded, after the redirect has been sent (docs/blueprint/06 §5: redirects always work).
  event.waitUntil(recordClick(db, {
    shortLinkId: resolved.shortLinkId,
    workspaceId: resolved.workspaceId,
    ip: clientIpFromHeaders(headers),
    userAgent: headers.get('user-agent') ?? '',
    method: event.method,
    purpose: headers.get('sec-purpose') ?? headers.get('purpose'),
    referrer: headers.get('referer'),
    country: headers.get('cf-ipcountry'),
    region: headers.get('cf-region'),
    city: headers.get('cf-ipcity')
  }).catch(error => console.error(JSON.stringify({ level: 'error', msg: 'click.record_failed', error: String(error) }))))
  return sendRedirect(event, resolved.destinationUrl, 302)
})
