/** Short link names on the short domain: case-sensitive base62 + - and _ (docs/blueprint/14 §5). */
export const SLUG_PATTERN = /^[0-9A-Za-z_-]{3,32}$/
export const AUTO_SLUG_LENGTH = 6

export type Merchant = 'shopee' | 'tokopedia' | 'tiktok_shop' | 'lazada' | 'other'

const MERCHANT_HOSTS: [RegExp, Merchant][] = [
  [/(^|\.)shopee\.co\.id$|(^|\.)shope\.ee$/, 'shopee'],
  [/(^|\.)tokopedia\.(com|link)$/, 'tokopedia'],
  [/(^|\.)tiktok\.com$/, 'tiktok_shop'],
  [/(^|\.)lazada\.co\.id$/, 'lazada']
]

export function detectMerchant(url: string): Merchant {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return MERCHANT_HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? 'other'
  } catch {
    return 'other'
  }
}

export const MERCHANT_META: Record<Merchant, { label: string, color: string }> = {
  shopee: { label: 'Shopee', color: '#EE4D2D' },
  tokopedia: { label: 'Tokopedia', color: '#03AC0E' },
  tiktok_shop: { label: 'TikTok Shop', color: '#000000' },
  lazada: { label: 'Lazada', color: '#0F146D' },
  other: { label: 'Toko', color: '#71717A' }
}

/** host matches an allowlist entry exactly or as a subdomain. */
export function hostAllowed(url: string, allowlist: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return allowlist.some(entry => host === entry || host.endsWith(`.${entry}`))
  } catch {
    return false
  }
}

/**
 * The product name some shops put in the link itself ("…/ddailylife-lemari-plastik-1733843815370622331"),
 * for when the shop page cannot be read. Null for short links and ID-only paths.
 */
export function titleFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  const merchant = detectMerchant(url)
  let slug: string | undefined
  if (merchant === 'tokopedia' && /(^|\.)tokopedia\.com$/i.test(parsed.hostname) && segments.length === 2) {
    slug = segments[1]!.replace(/-\d{6,}$/, '')
  } else if (merchant === 'shopee' && segments.length === 1 && /-i\.\d+\.\d+$/.test(segments[0]!)) {
    slug = segments[0]!.replace(/-i\.\d+\.\d+$/, '')
  } else if (merchant === 'lazada' && segments[0] === 'products' && segments.length === 2) {
    slug = segments[1]!.replace(/\.html$/i, '').replace(/-i\d+(-s\d+)?$/, '')
  }
  if (!slug) return null
  let words: string
  try {
    words = decodeURIComponent(slug)
  } catch {
    return null
  }
  // Hyphens between digits stay ("1-6 susun"); the rest become spaces.
  words = words.replace(/(?<!\d)-|-(?!\d)/g, ' ').replace(/\s+/g, ' ').trim()
  if (words.length < 3 || !/\p{L}/u.test(words)) return null
  return words.replace(/(^|\s)(\p{Ll})/gu, (_m, space: string, letter: string) => space + letter.toUpperCase()).slice(0, 200)
}
