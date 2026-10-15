/** Date keys ('YYYY-MM-DD') on a zone's local clock. Indonesian zones have fixed offsets and no DST. */
export const PLATFORM_TIMEZONE = 'Asia/Jakarta'

export function zonedDateKey(instant: Date, tz: string = PLATFORM_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function todayKey(tz: string = PLATFORM_TIMEZONE, now: Date = new Date()): string {
  return zonedDateKey(now, tz)
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

/** Offset of tz from UTC in minutes at a given instant (positive east of UTC). */
export function offsetMinutes(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(at)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}

export function startOfZonedDay(key: string, tz: string = PLATFORM_TIMEZONE): Date {
  const utcMidnight = new Date(`${key}T00:00:00Z`)
  return new Date(utcMidnight.getTime() - offsetMinutes(tz, utcMidnight) * 60_000)
}

export function addDaysToKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Half-open [start, end) instants of a local day. */
export function zonedDayRange(key: string, tz: string = PLATFORM_TIMEZONE): { start: Date, end: Date } {
  return { start: startOfZonedDay(key, tz), end: startOfZonedDay(addDaysToKey(key, 1), tz) }
}
