import { describe, expect, it } from 'vitest'
import { actualStage, ideaHasDetail, IDEA_STAGES, moveCheck, postStage, type PostStatus } from '../../shared/utils/planner'

const none = { note: null, pillar: null, plannedOn: null, momentId: null, linkCount: 0, mediaCount: 0 }

describe('postStage', () => {
  it.each([
    ['draft', 'drafting'], ['cancelled', 'drafting'], ['scheduled', 'scheduled'], ['publishing', 'scheduled'],
    ['published', 'published'], ['partial', 'published'], ['failed', 'failed']
  ] as [PostStatus, string][])('%s -> %s', (status, stage) => {
    expect(postStage(status)).toBe(stage)
  })
})

describe('ideaHasDetail / actualStage', () => {
  it('detects any detail', () => {
    expect(ideaHasDetail(none)).toBe(false)
    expect(ideaHasDetail({ ...none, note: '  ' })).toBe(false)
    for (const patch of [{ note: 'x' }, { pillar: 'promo' }, { plannedOn: '2026-11-15' }, { momentId: 'm' }, { linkCount: 1 }, { mediaCount: 1 }]) {
      expect(ideaHasDetail({ ...none, ...patch })).toBe(true)
    }
  })
  it('follows the post, else the detail', () => {
    expect(actualStage({ postStatus: 'failed', hasDetail: false })).toBe('failed')
    expect(actualStage({ postStatus: null, hasDetail: true })).toBe('drafting')
    expect(actualStage({ postStatus: null, hasDetail: false })).toBe('raw')
  })
})

describe('moveCheck', () => {
  it('is null for honest moves', () => {
    for (const s of IDEA_STAGES) expect(moveCheck(s, s)).toBeNull()
    expect(moveCheck('raw', 'drafting')).toBeNull()
  })
  it('gives a reason otherwise', () => {
    expect(moveCheck('drafting', 'scheduled')).toBe('no_schedule')
    expect(moveCheck('raw', 'scheduled')).toBe('no_schedule')
    expect(moveCheck('drafting', 'published')).toBe('not_live')
    expect(moveCheck('raw', 'failed')).toBe('not_failed')
    expect(moveCheck('drafting', 'raw')).toBe('has_detail')
    for (const actual of ['scheduled', 'published', 'failed'] as const) {
      for (const to of IDEA_STAGES.filter(s => s !== actual)) expect(moveCheck(actual, to)).toBe('post_stays')
    }
  })
})
