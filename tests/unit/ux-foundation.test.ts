import { describe, expect, it } from 'vitest'
import { initialOf, tintOf } from '../../app/utils/smart-image'
import { quickDays, quickPostSlots } from '../../app/utils/schedule'
import { MILESTONE_KEYS, isMilestoneKey } from '../../shared/utils/milestones'
import { OVERDUE_GRACE_MS, isOverdue } from '../../shared/utils/overdue'
import { ONBOARDING_STEPS } from '../../shared/utils/onboarding'

const TZ = 'Asia/Jakarta'
// 2026-10-24 is a Saturday. Times below are Jakarta (UTC+7).
const at = (iso: string) => new Date(`${iso}+07:00`)

describe('quickPostSlots', () => {
  it('offers tonight, tomorrow noon and Saturday on a weekday morning', () => {
    const slots = quickPostSlots(TZ, at('2026-10-21T09:00:00')) // Wednesday
    expect(slots).toEqual([
      { key: 'tonight', date: '2026-10-21', time: '19:00' },
      { key: 'tomorrowNoon', date: '2026-10-22', time: '12:00' },
      { key: 'saturday', date: '2026-10-24', time: '19:00' }
    ])
  })

  it('swaps tonight for tomorrow evening after 18:30', () => {
    const slots = quickPostSlots(TZ, at('2026-10-21T18:45:00'))
    expect(slots.map(s => s.key)).toEqual(['tomorrowNoon', 'tomorrowEvening', 'saturday'])
    expect(slots[1]).toEqual({ key: 'tomorrowEvening', date: '2026-10-22', time: '19:00' })
  })

  it('keeps tonight at 18:29 and drops it at 18:30', () => {
    expect(quickPostSlots(TZ, at('2026-10-21T18:29:00'))[0]!.key).toBe('tonight')
    expect(quickPostSlots(TZ, at('2026-10-21T18:30:00'))[0]!.key).toBe('tomorrowNoon')
  })

  it('skips Saturday when it equals tonight', () => {
    const slots = quickPostSlots(TZ, at('2026-10-24T10:00:00'))
    expect(slots.map(s => s.key)).toEqual(['tonight', 'tomorrowNoon'])
  })

  it('moves to next Saturday when Saturday evening is already gone', () => {
    const slots = quickPostSlots(TZ, at('2026-10-24T20:00:00'))
    expect(slots.at(-1)).toEqual({ key: 'saturday', date: '2026-10-31', time: '19:00' })
  })

  it('skips Saturday when tomorrow evening is Saturday 19:00', () => {
    const slots = quickPostSlots(TZ, at('2026-10-23T20:00:00')) // Friday night
    expect(slots.map(s => s.key)).toEqual(['tomorrowNoon', 'tomorrowEvening'])
  })

  it('uses the workspace clock, not the device clock', () => {
    // 2026-10-21 18:00 UTC is already 01:00 on the 22nd in Jakarta.
    const slots = quickPostSlots(TZ, new Date('2026-10-21T18:00:00Z'))
    expect(slots[0]).toEqual({ key: 'tonight', date: '2026-10-22', time: '19:00' })
  })
})

describe('quickDays', () => {
  it('labels today and tomorrow, then weekdays', () => {
    const days = quickDays(TZ, at('2026-10-21T09:00:00'), 4)
    expect(days.map(d => d.date)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'])
    expect(days.map(d => d.labelKey)).toEqual(['when.today', 'when.tomorrow', 'when.weekday', 'when.weekday'])
    expect(days[2]!.weekday).toBeTruthy()
  })
})

describe('isOverdue', () => {
  const now = Date.parse('2026-10-24T10:00:00Z')
  it('is true only for scheduled posts past the grace period', () => {
    expect(isOverdue('scheduled', new Date(now - OVERDUE_GRACE_MS - 1000), now)).toBe(true)
    expect(isOverdue('scheduled', new Date(now - OVERDUE_GRACE_MS + 1000), now)).toBe(false)
    expect(isOverdue('scheduled', new Date(now + 60_000).toISOString(), now)).toBe(false)
  })
  it('ignores other statuses and missing times', () => {
    expect(isOverdue('published', new Date(now - 3_600_000), now)).toBe(false)
    expect(isOverdue('draft', new Date(now - 3_600_000), now)).toBe(false)
    expect(isOverdue('scheduled', null, now)).toBe(false)
  })
})

describe('milestone keys', () => {
  it('knows the fixed keys and week targets only', () => {
    for (const key of MILESTONE_KEYS) expect(isMilestoneKey(key)).toBe(true)
    expect(isMilestoneKey('weekTarget:2026-10-19')).toBe(true)
    expect(isMilestoneKey('weekTarget:19-10-2026')).toBe(false)
    expect(isMilestoneKey('other')).toBe(false)
  })
})

describe('onboarding steps', () => {
  it('has four steps with i18n keys', () => {
    expect(ONBOARDING_STEPS.map(s => s.key)).toEqual(['accountConnected', 'postScheduled', 'bioCreated', 'autoReplyAdded'])
    for (const s of ONBOARDING_STEPS) expect(s.titleKey).toBe(`onboarding.steps.${s.key}.title`)
  })
})

describe('smart image helpers', () => {
  it('takes the first letter or digit, uppercase', () => {
    expect(initialOf('  sepatu lari')).toBe('S')
    expect(initialOf('...éclair')).toBe('É')
    expect(initialOf('3 in 1')).toBe('3')
    expect(initialOf(null)).toBe('')
    expect(initialOf('!!!')).toBe('')
  })
  it('builds a 14% tint', () => {
    expect(tintOf('#EE4D2D')).toBe('color-mix(in srgb, #EE4D2D 14%, transparent)')
  })
})
