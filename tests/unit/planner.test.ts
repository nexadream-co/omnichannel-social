import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, momentIdeaSkeletons, momentName, SEED_MOMENTS, spreadOverEmptyDays, weekFill, weekStart } from '../../shared/utils/planner'

describe('planner days', () => {
  it('counts on local calendar days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(weekStart('2026-10-25')).toBe('2026-10-19') // Sunday → Monday before
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
    expect(daysBetween('2026-10-23', '2026-11-11')).toBe(19)
  })

  it('fills the week with posts and planned ideas, and lists open future days', () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays('2026-10-19', i))
    const fill = weekFill(days, new Map([['2026-10-20', 1], ['2026-10-24', 1]]), 3, '2026-10-22')
    expect(fill).toMatchObject({ count: 2, target: 3, reached: false })
    expect(fill.emptyDays).toEqual(['2026-10-22', '2026-10-23', '2026-10-25'])
    expect(weekFill(days, new Map([['2026-10-20', 3]]), 3, '2026-10-19')).toMatchObject({ reached: true, emptyDays: [] })
  })
})

describe('spreading Galeri ideas', () => {
  it('takes the next empty days in order and leaves the rest undated', () => {
    expect(spreadOverEmptyDays('2026-10-25', new Set(['2026-10-25', '2026-10-27']), 3)).toEqual(['2026-10-26', '2026-10-28', '2026-10-29'])
    expect(spreadOverEmptyDays('2026-10-25', new Set(['2026-10-26']), 3, 2)).toEqual(['2026-10-25', null, null])
  })
})

describe('moments', () => {
  it('turns a sale into a teaser, a review and the day itself', () => {
    const ideas = momentIdeaSkeletons({ name: 'Promo 11.11', kind: 'twin_date', startsOn: '2026-11-11', prepDays: 3 }, '2026-10-23')
    expect(ideas.map(i => [i.plannedOn, i.pillar])).toEqual([['2026-11-08', 'cerita'], ['2026-11-10', 'review'], ['2026-11-11', 'promo']])
    expect(ideas[0]!.title).toContain('Promo 11.11')
    expect(momentIdeaSkeletons({ name: 'Promo 11.11', nameEn: '11.11 Sale', kind: 'twin_date', startsOn: '2026-11-11', prepDays: 3 }, '2026-10-23', 'en')[2]!.title).toContain('11.11 Sale')
  })

  it('moves days already gone to today', () => {
    const ideas = momentIdeaSkeletons({ name: 'Natal', kind: 'holiday', startsOn: '2026-12-25', prepDays: 7 }, '2026-12-24')
    expect(ideas.map(i => i.plannedOn)).toEqual(['2026-12-24', '2026-12-24', '2026-12-25'])
  })

  it('falls back to the Bahasa name', () => {
    expect(momentName({ name: 'Gajian', nameEn: null }, 'en')).toBe('Gajian')
    expect(momentName({ name: 'Gajian', nameEn: 'Payday' }, 'en')).toBe('Payday')
  })

  it('seeds unique ids with sane ranges', () => {
    expect(new Set(SEED_MOMENTS.map(m => m.id)).size).toBe(SEED_MOMENTS.length)
    expect(SEED_MOMENTS.every(m => m.endsOn >= m.startsOn && m.prepDays >= 1)).toBe(true)
    expect(SEED_MOMENTS.find(m => m.id === 'moment-gajian-2026-12')).toMatchObject({ startsOn: '2026-12-25', endsOn: '2027-01-01' })
  })
})
