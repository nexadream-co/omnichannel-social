/** Product details from a marketplace page: OpenGraph + common price metas + JSON-LD Product. Pure. */
export interface Unfurled {
  title: string | null
  imageUrl: string | null
  priceIdr: number | null
}

function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
}

function meta(html: string, ...names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i')
    const tag = pattern.exec(html)?.[0]
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1]
    if (content?.trim()) return decodeEntities(content.trim())
  }
  return null
}

export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const value = typeof raw === 'number'
    ? raw
    // A plain machine number ("125000", "125000.00") parses as is; display formats ("Rp 125.000",
    // "125,000", "Rp125.000,00") drop a trailing 1–2 digit decimal part, then keep the digits.
    : /^\s*\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : Number(raw.replace(/[.,]\d{1,2}\s*$/, '').replace(/\D/g, ''))
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function jsonLdProduct(html: string): { name?: string, image?: string | string[], offers?: { price?: string | number } | { price?: string | number }[] } | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]!) as unknown
      const items = (Array.isArray(data) ? data : [data]).flatMap(item => (item as { '@graph'?: unknown[] })['@graph'] ?? [item]) as { '@type'?: string | string[] }[]
      const product = items.find(item => [item['@type']].flat().includes('Product'))
      if (product) return product as never
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null
}

function absoluteUrl(value: string, base: string): string | null {
  try {
    return new URL(value, base).toString()
  } catch {
    return null
  }
}

export function unfurlHtml(html: string, baseUrl: string): Unfurled {
  const product = jsonLdProduct(html)
  const offer = Array.isArray(product?.offers) ? product?.offers[0] : product?.offers
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]
  const title = meta(html, 'og:title', 'twitter:title') ?? product?.name ?? (titleTag ? decodeEntities(titleTag.trim()) : null)
  const rawImage = meta(html, 'og:image', 'og:image:url', 'twitter:image') ?? [product?.image].flat()[0] ?? null
  const imageUrl = rawImage ? absoluteUrl(rawImage, baseUrl) : null
  const priceIdr = parsePrice(meta(html, 'product:price:amount', 'og:price:amount', 'price') ?? offer?.price ?? null)
  return { title: title ? title.slice(0, 200) : null, imageUrl: imageUrl?.startsWith('https://') ? imageUrl : null, priceIdr }
}
