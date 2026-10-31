/** Range presets resolve on the platform clock (Asia/Jakarta). */
export function rangeStart(range: string): Date | null {
  if (range === 'all') return null
  const todayWib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const midnight = new Date(`${todayWib}T00:00:00+07:00`)
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29
  return new Date(midnight.getTime() - days * 86_400_000)
}
