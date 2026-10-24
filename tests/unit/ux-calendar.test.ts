import { describe, expect, it } from 'vitest'
import { isPastSlot } from '../../app/utils/schedule'
import { dayPlatforms, groupPostsByDay, type CalendarEntry } from '../../app/utils/calendar'

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({ id: 'e', postId: 'p1', platform: 'instagram', status: 'scheduled', scheduledAt: new Date(Date.now() + 3_600_000).toISOString(), removedAt: null, caption: 'Hai', pillar: null, ...over })

describe('Kalender day posts', () => {
  it('keeps the earliest instant and flags overdue scheduled targets', () => {
    const late = new Date(Date.now() - 3_600_000).toISOString()
    const [post] = [...groupPostsByDay([entry({ scheduledAt: late }), entry({ id: 'f', platform: 'facebook', scheduledAt: late })], 'Asia/Jakarta').values()].flat()
    expect(post).toMatchObject({ scheduledAt: late, overdue: true, platforms: ['instagram', 'facebook'] })
  })

  it('does not flag a future or published post', () => {
    const [future] = [...groupPostsByDay([entry({})], 'Asia/Jakarta').values()].flat()
    expect(future!.overdue).toBe(false)
    const old = new Date(Date.now() - 3_600_000).toISOString()
    const [done] = [...groupPostsByDay([entry({ status: 'published', scheduledAt: old })], 'Asia/Jakarta').values()].flat()
    expect(done!.overdue).toBe(false)
  })

  it('shows at most three platform dots and counts the rest', () => {
    const post = (platforms: ('instagram' | 'threads' | 'facebook' | 'tiktok')[]) => ({ postId: 'x', time: '09:00', caption: '', platforms, removed: [], status: 'scheduled', scheduledAt: '', overdue: false })
    expect(dayPlatforms([post(['instagram', 'threads']), post(['instagram'])])).toEqual({ shown: ['instagram', 'threads'], more: 0 })
    expect(dayPlatforms([post(['instagram', 'threads', 'facebook', 'tiktok'])])).toEqual({ shown: ['instagram', 'threads', 'facebook'], more: 1 })
  })
})

describe('isPastSlot', () => {
  const now = new Date('2026-10-24T05:00:00Z') // 12:00 in Jakarta
  it('flags a time of day that already passed on the workspace clock', () => {
    expect(isPastSlot('2026-10-24', '09:00', 'Asia/Jakarta', now)).toBe(true)
    expect(isPastSlot('2026-10-24', '18:00', 'Asia/Jakarta', now)).toBe(false)
    expect(isPastSlot('2026-10-25', '00:30', 'Asia/Jakarta', now)).toBe(false)
  })
})
