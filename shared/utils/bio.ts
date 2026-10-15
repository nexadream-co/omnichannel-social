/** Etalase handle rules (docs/blueprint/14 §4). */
export const HANDLE_PATTERN = /^[a-z0-9._]{3,30}$/
export const RESERVED_HANDLES = new Set([
  'app', 'admin', 'api', 'r', 'bio', 'socialz', 'socialzid', 'help', 'bantuan', 'support', 'login', 'register', 'daftar', 'masuk',
  'privacy', 'terms', 'legal', 'hapus-akun', 'kontak', 'harga', 'pricing', 'about', 'tentang', 'blog', 'www', 'mail', 'static',
  'instagram', 'threads', 'facebook', 'tiktok', 'youtube', 'x', 'twitter', 'shopee', 'tokopedia', 'lazada', 'meta', 'null', 'undefined'
])

export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '')
}

export type BioThemeKey = 'rose' | 'mint' | 'night'

/** Three presets in v1 (ARCHITECTURE §19); custom colours later. Plain colours, no user CSS. */
export const BIO_THEMES: Record<BioThemeKey, { labelKey: string, background: string, card: string, text: string, muted: string, accent: string, accentText: string }> = {
  rose: { labelKey: 'bio.theme.rose', background: '#fff1f3', card: '#ffffff', text: '#18181b', muted: '#71717a', accent: '#e6114f', accentText: '#ffffff' },
  mint: { labelKey: 'bio.theme.mint', background: '#ecfdf5', card: '#ffffff', text: '#052e16', muted: '#4b5563', accent: '#059669', accentText: '#ffffff' },
  night: { labelKey: 'bio.theme.night', background: '#0f0f12', card: '#1c1c22', text: '#fafafa', muted: '#a1a1aa', accent: '#ff6388', accentText: '#0f0f12' }
}

export const BIO_SOCIALS = ['instagram', 'threads', 'tiktok', 'facebook', 'youtube', 'whatsapp'] as const
export type BioSocial = (typeof BIO_SOCIALS)[number]
