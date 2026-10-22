/** Locale-aware formatting (docs/blueprint/13 §7). Month and day names come from Intl, never hard-coded. */
function intlLocale(locale?: string) {
  return locale === 'en' ? 'en-GB' : 'id-ID'
}

export function formatIDR(value: number, locale?: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

export function formatDate(value: string | Date | null | undefined, options: { locale?: string, timeZone?: string } = {}): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(intlLocale(options.locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: options.timeZone ?? 'Asia/Jakarta' }).format(new Date(value))
}

export function formatDateTime(value: string | Date | null | undefined, options: { locale?: string, timeZone?: string } = {}): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(intlLocale(options.locale), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: options.timeZone ?? 'Asia/Jakarta' }).format(new Date(value))
}

export function formatRelative(value: string | Date, locale?: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 30 * 86_400) return rtf.format(Math.round(seconds / 86_400), 'day')
  return formatDate(value, { locale })
}

/** 1.2 GB / 340 MB / 12 KB (storage used in Galeri Media). */
export function formatBytes(bytes: number, locale?: string): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: value < 10 && unit > 1 ? 1 : 0 }).format(value)} ${units[unit]}`
}

/** 0:07 / 12:30 (video length). */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function formatCompact(value: number, locale?: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
