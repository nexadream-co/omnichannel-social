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
