/** Indonesian zones have fixed offsets and no DST, so the composer can convert without a tz database. */
const OFFSETS: Record<string, string> = { 'Asia/Jakarta': '+07:00', 'Asia/Makassar': '+08:00', 'Asia/Jayapura': '+09:00' }

export function zoneOffset(tz: string): string {
  return OFFSETS[tz] ?? '+07:00'
}

/** '2026-10-16', '19:00' in the workspace zone → ISO instant with offset (the server never sees naive times). */
export function toZonedIso(date: string, time: string, tz: string): string {
  return `${date}T${time}:00${zoneOffset(tz)}`
}

/** True when this day and time of day already passed on the workspace clock (the server refuses those). */
export function isPastSlot(date: string, time: string, tz: string, now: Date = new Date()): boolean {
  return new Date(toZonedIso(date, time, tz)).getTime() < now.getTime()
}

/** An instant → { date, time } on the workspace clock. */
export function zonedParts(instant: Date, tz: string): { date: string, time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

/** Smart default: tonight 19:00 (when people scroll most), or tomorrow 12:00 if it's already late. */
export function suggestedSlot(tz: string, now: Date = new Date()): { date: string, time: string } {
  const local = zonedParts(now, tz)
  const [h, m] = local.time.split(':').map(Number) as [number, number]
  if (h * 60 + m < 18 * 60 + 30) return { date: local.date, time: '19:00' }
  const tomorrow = zonedParts(new Date(now.getTime() + 86_400_000), tz)
  return { date: tomorrow.date, time: '12:00' }
}

/** Calendar-date arithmetic on 'YYYY-MM-DD' strings (UTC math is safe: no time of day is involved). */
function addDaysTo(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export type QuickSlotKey = 'tonight' | 'tomorrowNoon' | 'tomorrowEvening' | 'saturday'

/**
 * One-tap times for the composer: tonight 19:00 (only before 18:30), tomorrow noon, tomorrow evening (when tonight
 * is gone) and the coming Saturday evening, never the same moment twice. suggestedSlot stays the default.
 */
export function quickPostSlots(tz: string, now: Date = new Date()): { key: QuickSlotKey, date: string, time: string }[] {
  const local = zonedParts(now, tz)
  const [h, m] = local.time.split(':').map(Number) as [number, number]
  const early = h * 60 + m < 18 * 60 + 30
  const tomorrow = addDaysTo(local.date, 1)
  const slots: { key: QuickSlotKey, date: string, time: string }[] = []
  if (early) slots.push({ key: 'tonight', date: local.date, time: '19:00' })
  slots.push({ key: 'tomorrowNoon', date: tomorrow, time: '12:00' })
  if (!early) slots.push({ key: 'tomorrowEvening', date: tomorrow, time: '19:00' })
  let ahead = (6 - weekdayOf(local.date) + 7) % 7
  if (ahead === 0 && !early) ahead = 7
  const saturday = addDaysTo(local.date, ahead)
  if (!slots.some(s => s.date === saturday && s.time === '19:00')) slots.push({ key: 'saturday', date: saturday, time: '19:00' })
  return slots
}

/** The next days for a day picker: today, tomorrow, then weekday names. */
export function quickDays(tz: string, now: Date = new Date(), count = 7, locale = 'id-ID'): { key: string, date: string, labelKey: 'when.today' | 'when.tomorrow' | 'when.weekday', weekday?: string }[] {
  const today = zonedParts(now, tz).date
  return Array.from({ length: count }, (_, i) => {
    const date = addDaysTo(today, i)
    if (i === 0) return { key: date, date, labelKey: 'when.today' as const }
    if (i === 1) return { key: date, date, labelKey: 'when.tomorrow' as const }
    return { key: date, date, labelKey: 'when.weekday' as const, weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) }
  })
}
