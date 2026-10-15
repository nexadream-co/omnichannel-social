import { env } from '../core/env'
import { sitemapPages } from '../core/public-site'

const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Main domain only; Etalase pages are not listed (docs/blueprint/14 §6). */
export default defineEventHandler(async (event) => {
  const site = env().siteUrl
  const pages = await sitemapPages(requestContext(event).db)
  const urls = [
    { path: '/', updatedAt: null }, { path: '/harga', updatedAt: null }, { path: '/hapus-akun', updatedAt: null },
    ...pages
  ]
  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.map(u => `  <url><loc>${escape(site + u.path)}</loc>${u.updatedAt ? `<lastmod>${u.updatedAt.toISOString().slice(0, 10)}</lastmod>` : ''}<xhtml:link rel="alternate" hreflang="en" href="${escape(`${site}/en${u.path === '/' ? '' : u.path}`)}"/></url>`).join('\n')}\n</urlset>\n`
})
