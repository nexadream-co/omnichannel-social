/** Balas Otomatis (comment-to-DM) rules shared by the editor's "Coba" button and the webhook worker. */

export type DmMatchMode = 'exact' | 'contains'
export type DmEventStatus = 'matched' | 'dm_sent' | 'replied' | 'skipped' | 'skipped_dup' | 'skipped_expired' | 'rate_limited' | 'failed'

export const MAX_KEYWORDS = 10
export const MAX_PUBLIC_REPLIES = 5
/** Instagram allows a private reply only within 7 days of the comment (PLATFORM-CONSTRAINTS). */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 86_400_000

/** Lowercase, no accents, punctuation and emoji become spaces, single spaces. "MAU kak!!" → "mau kak". */
export function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function normalizeKeywords(values: string[]): string[] {
  return [...new Set(values.map(normalizeText).filter(Boolean))].slice(0, MAX_KEYWORDS)
}

/**
 * No keywords = every comment matches. "contains" matches whole words ("mau" matches "mau kak", not "maumere");
 * "exact" needs the whole comment to be the keyword.
 */
export function commentMatches(comment: string, keywords: string[], mode: DmMatchMode): boolean {
  const text = normalizeText(comment)
  if (!keywords.length) return text.length > 0
  return keywords.some((keyword) => {
    const k = normalizeText(keyword)
    if (!k) return false
    return mode === 'exact' ? text === k : ` ${text} `.includes(` ${k} `)
  })
}

/** {nama} → the commenter's username, {link} → the product short link (appended when the message has no {link}). */
export function composeDm(template: string, values: { name: string | null, link: string | null }): string {
  let text = template.replace(/\{nama\}/gi, values.name ? `@${values.name}` : 'kak')
  if (values.link) text = /\{link\}/i.test(text) ? text.replace(/\{link\}/gi, values.link) : `${text.trimEnd()}\n${values.link}`
  else text = text.replace(/\{link\}/gi, '')
  return text.trim()
}

export interface RuleTemplate {
  key: string
  titleKey: string
  scope: 'post' | 'global'
  keywords: string[]
  dmMessage: string
  publicReplyVariants: string[]
}

export const DEFAULT_PUBLIC_REPLIES = ['Cek DM ya kak! 💌', 'Udah aku kirim ke DM ya kak 🙌', 'Link-nya sudah di DM, kak!']

/** Ready-made rules (docs/SCREENS.md #24): one tap fills the editor. */
export const RULE_TEMPLATES: RuleTemplate[] = [
  { key: 'mau', titleKey: 'autoReply.templates.mau', scope: 'global', keywords: ['mau', 'link', 'info'], dmMessage: 'Hai {nama}! Makasih sudah komen 😊 Ini link produknya ya: {link}', publicReplyVariants: DEFAULT_PUBLIC_REPLIES },
  { key: 'harga', titleKey: 'autoReply.templates.harga', scope: 'global', keywords: ['harga', 'berapa', 'hm', 'price'], dmMessage: 'Hai {nama}! Harga terbaru dan link belinya di sini ya: {link}', publicReplyVariants: DEFAULT_PUBLIC_REPLIES },
  { key: 'semua', titleKey: 'autoReply.templates.semua', scope: 'post', keywords: [], dmMessage: 'Hai {nama}! Ini link produk dari postingan tadi ya: {link}', publicReplyVariants: DEFAULT_PUBLIC_REPLIES }
]

/** Label keys for every status, so the activity list never shows a raw enum (CLAUDE.md rule 13). */
export const DM_EVENT_STATUS_KEYS: Record<DmEventStatus, string> = {
  matched: 'autoReply.status.matched',
  dm_sent: 'autoReply.status.dm_sent',
  replied: 'autoReply.status.dm_sent',
  skipped: 'autoReply.status.skipped',
  skipped_dup: 'autoReply.status.skipped_dup',
  skipped_expired: 'autoReply.status.skipped_expired',
  rate_limited: 'autoReply.status.rate_limited',
  failed: 'autoReply.status.failed'
}

/** dm_events.error codes the worker writes; each has a plain-Bahasa reason in i18n (autoReply.reason.*). */
export const DM_REASONS = ['kill_switch', 'account_inactive', 'plan_limit', 'daily_cap', 'hourly_cap', 'auth', 'rejected', 'no_rule'] as const
export type DmReason = (typeof DM_REASONS)[number]
