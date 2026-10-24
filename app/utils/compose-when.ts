import { quickPostSlots, type QuickSlotKey } from './schedule'

export interface WhenChip { key: QuickSlotKey, date: string, time: string }

/** "19:00" on the Indonesian clock reads "19.00". */
export function clockLabel(time: string, locale: string): string {
  return locale === 'en' ? time : time.replace(':', '.')
}

/** The chip that matches the picked slot exactly, or null when the creator chose their own time. */
export function matchingChip(chips: WhenChip[], slot: { date: string, time: string }): WhenChip | null {
  return chips.find(c => c.date === slot.date && c.time === slot.time) ?? null
}

/** Short label for the sticky bar: the chip name, or "Sab, 24 Okt 19.00" for a custom time. */
export function slotLabel(slot: { date: string, time: string }, tz: string, t: (key: string, params?: Record<string, unknown>) => string, locale: string, now: Date = new Date()): string {
  const chip = matchingChip(quickPostSlots(tz, now), slot)
  const time = clockLabel(slot.time, locale)
  if (chip) return t(`when.${chip.key}`, { time })
  if (!slot.date) return ''
  const day = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${slot.date}T00:00:00Z`))
  return `${day} ${time}`
}
