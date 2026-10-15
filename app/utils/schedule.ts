/** Indonesian zones have fixed offsets and no DST, so the composer can convert without a tz database. */
const OFFSETS: Record<string, string> = { 'Asia/Jakarta': '+07:00', 'Asia/Makassar': '+08:00', 'Asia/Jayapura': '+09:00' }

export function zoneOffset(tz: string): string {
  return OFFSETS[tz] ?? '+07:00'
}

/** '2026-10-16', '19:00' in the workspace zone → ISO instant with offset (the server never sees naive times). */
export function toZonedIso(date: string, time: string, tz: string): string {
  return `${date}T${time}:00${zoneOffset(tz)}`
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
