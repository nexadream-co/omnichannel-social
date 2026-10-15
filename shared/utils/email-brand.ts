export interface EmailBrand {
  appName: string
  siteUrl: string
  supportEmail: string
  companyName: string
  logoUrl?: string
  whatsappUrl?: string
}

/** Root-relative hrefs → absolute, because mail clients have no base URL. Leaves //host, mailto:, # and absolute links alone. */
export function absolutizeHrefs(html: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  return html.replace(/href="\/(?!\/)([^"]*)"/g, (_match, path: string) => `href="${base}/${path}"`)
}

export function wrapEmailHtml(inner: string, brand: EmailBrand): string {
  const year = new Date().getUTCFullYear()
  const logo = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.appName}" height="32" style="height:32px">`
    : `<span style="font-size:20px;font-weight:700;color:#e6114f">${brand.appName}</span>`
  const whatsapp = brand.whatsappUrl ? ` · <a href="${brand.whatsappUrl}" style="color:#71717a">WhatsApp</a>` : ''
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
.btn{display:inline-block;background:#e6114f;color:#ffffff !important;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600}
p{margin:0 0 16px}
</style></head><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px">
<tr><td style="padding:24px 24px 0"><a href="/" style="text-decoration:none">${logo}</a></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">${inner}</td></tr>
</table>
<p style="font-size:12px;color:#71717a;margin-top:16px">© ${year} ${brand.companyName} · <a href="mailto:${brand.supportEmail}" style="color:#71717a">${brand.supportEmail}</a>${whatsapp}</p>
</td></tr></table></body></html>`
  return absolutizeHrefs(html, brand.siteUrl)
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|div|tr|h\d|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
