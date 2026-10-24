/** A scheduled post this far past its time counts as overdue (the publisher normally runs within a minute). */
export const OVERDUE_GRACE_MS = 10 * 60_000

export function isOverdue(status: string, scheduledAt: string | Date | null, now: number = Date.now()): boolean {
  if (status !== 'scheduled' || !scheduledAt) return false
  return new Date(scheduledAt).getTime() < now - OVERDUE_GRACE_MS
}
