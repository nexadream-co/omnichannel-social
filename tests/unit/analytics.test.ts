import { describe, expect, it } from 'vitest'
import { deltaPercent, ratePer1000, RATE_MIN_VIEWS, viewsOf } from '../../shared/utils/analytics'

describe('viewsOf', () => {
  it('prefers views, then impressions, then reach, and ignores non-numbers', () => {
    expect(viewsOf({ views: 10, impressions: 20, reach: 30 })).toBe(10)
    expect(viewsOf({ impressions: 20, reach: 30 })).toBe(20)
    expect(viewsOf({ reach: 30 })).toBe(30)
    expect(viewsOf({ views: '10', likes: 4 })).toBeNull()
    expect(viewsOf({ views: 0 })).toBe(0)
    expect(viewsOf(null)).toBeNull()
    expect(viewsOf(undefined)).toBeNull()
  })
})

describe('ratePer1000', () => {
  it('is null without views or below the minimum', () => {
    expect(ratePer1000(5, null)).toBeNull()
    expect(ratePer1000(1, RATE_MIN_VIEWS - 1)).toBeNull()
  })
  it('rounds to one decimal', () => {
    expect(ratePer1000(10, 1000)).toBe(10)
    expect(ratePer1000(1, 300)).toBe(3.3)
    expect(ratePer1000(0, RATE_MIN_VIEWS)).toBe(0)
  })
})

describe('deltaPercent', () => {
  it('compares with the period before', () => {
    expect(deltaPercent(15, 10)).toBe(50)
    expect(deltaPercent(5, 10)).toBe(-50)
    expect(deltaPercent(10, 10)).toBe(0)
    expect(deltaPercent(3, 0)).toBe('new')
    expect(deltaPercent(0, 0)).toBeNull()
    expect(deltaPercent(3, null)).toBeNull()
    expect(deltaPercent(3, undefined)).toBeNull()
  })
})
