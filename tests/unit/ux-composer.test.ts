import { describe, expect, it } from 'vitest'
import { DRAFT_MAX_AGE_MS, draftBackupKey, draftKey, isDraftEmpty, isFreshComposer, parseDraft, serialiseDraft } from '../../app/utils/compose-draft'
import { clockLabel, matchingChip, slotLabel } from '../../app/utils/compose-when'
import { matchNiche, nicheSuggestions } from '../../app/utils/niche-tags'
import { quickPostSlots } from '../../app/utils/schedule'
import { CHANNELS } from '../../shared/channels/registry'
import { previewCaption } from '../../shared/channels/preview'
import type { LibraryTag } from '../../shared/hashtags/types'

const base = { caption: 'Diskon 50%', selected: ['a1'], mediaIds: [], options: {}, pillar: 'none', slot: { date: '2026-10-24', time: '19:00' } }
const NOW = Date.parse('2026-10-24T10:00:00Z')

describe('compose draft', () => {
  it('keys the draft per workspace', () => {
    expect(draftKey('ws1')).toBe('socialz:compose-draft:ws1')
  })

  it('autosaves only a blank composer', () => {
    expect(isFreshComposer({})).toBe(true)
    expect(isFreshComposer({ edit: null, duplicate: null, idea: null, media: null })).toBe(true)
    for (const source of [{ edit: 'p1' }, { duplicate: 'p1' }, { idea: 'i1' }, { media: 'm1,m2' }]) expect(isFreshComposer(source)).toBe(false)
  })

  it('keeps the backup under its own key', () => {
    expect(draftBackupKey('ws1')).toBe('socialz:compose-draft:ws1:backup')
  })

  it('does not save an empty composer', () => {
    expect(serialiseDraft({ ...base, caption: '  ' }, NOW)).toBeNull()
    expect(isDraftEmpty({ caption: '', mediaIds: [], options: { a: { captionOverride: '', format: null, firstComment: '', altText: '' } } })).toBe(true)
    expect(isDraftEmpty({ caption: '', mediaIds: ['m1'], options: {} })).toBe(false)
    expect(isDraftEmpty({ caption: '', mediaIds: [], options: { a: { captionOverride: 'x', format: null, firstComment: '', altText: '' } } })).toBe(false)
  })

  it('round-trips a draft', () => {
    const raw = serialiseDraft({ ...base, mediaIds: ['m1', 'm2'] }, NOW)!
    expect(parseDraft(raw, NOW + 1000)).toMatchObject({ caption: 'Diskon 50%', mediaIds: ['m1', 'm2'], selected: ['a1'], savedAt: NOW })
  })

  it('expires after 7 days', () => {
    const raw = serialiseDraft(base, NOW)!
    expect(parseDraft(raw, NOW + DRAFT_MAX_AGE_MS - 1)).not.toBeNull()
    expect(parseDraft(raw, NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull()
  })

  it('ignores broken storage', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('not json')).toBeNull()
    expect(parseDraft('{"caption":"x"}')).toBeNull()
    expect(parseDraft(JSON.stringify({ caption: 5, savedAt: NOW, mediaIds: 'x' }), NOW)).toBeNull()
  })
})

describe('previewCaption', () => {
  it('cuts Instagram at 125 characters', () => {
    const long = 'a'.repeat(300)
    const out = previewCaption(CHANNELS.instagram, long)
    expect(out.truncated).toBe(true)
    expect(out.text.length).toBe(125)
  })

  it('shows short captions and uncapped channels in full', () => {
    expect(previewCaption(CHANNELS.instagram, 'pendek')).toEqual({ text: 'pendek', truncated: false })
    expect(previewCaption(CHANNELS.threads, 'a'.repeat(400)).truncated).toBe(false)
    expect(previewCaption(CHANNELS.facebook, 'a'.repeat(481)).truncated).toBe(true)
  })

  it('counts an emoji as one character', () => {
    const out = previewCaption(CHANNELS.instagram, '💖'.repeat(125))
    expect(out.truncated).toBe(false)
  })
})

describe('compose time chips', () => {
  const now = new Date('2026-10-21T09:00:00+07:00')
  const t = (key: string, params?: Record<string, unknown>) => `${key}:${params?.time ?? ''}`

  it('matches a slot to its chip', () => {
    const chips = quickPostSlots('Asia/Jakarta', now)
    expect(matchingChip(chips, { date: '2026-10-21', time: '19:00' })?.key).toBe('tonight')
    expect(matchingChip(chips, { date: '2026-10-21', time: '20:15' })).toBeNull()
  })

  it('labels chips and custom times', () => {
    expect(slotLabel({ date: '2026-10-21', time: '19:00' }, 'Asia/Jakarta', t, 'id', now)).toBe('when.tonight:19.00')
    expect(slotLabel({ date: '2026-10-28', time: '08:30' }, 'Asia/Jakarta', t, 'id', now)).toMatch(/28.*08\.30/)
    expect(clockLabel('19:00', 'en')).toBe('19:00')
  })
})

describe('niche tag seeds', () => {
  const lib = (tag: string, niche: LibraryTag['niche'], breadth: LibraryTag['breadth'], status: LibraryTag['status'] = 'recommended'): LibraryTag => ({ tag, niche, keywords: [], breadth, status, platforms: [] })

  it('matches the workspace niche text', () => {
    expect(matchNiche('Skincare')).toBe('skincare')
    expect(matchNiche('mom baby')).toBe('mom_baby')
    expect(matchNiche('skincare lokal')).toBe('skincare')
    expect(matchNiche('')).toBeNull()
    expect(matchNiche('otomotif')).toBeNull()
  })

  it('suggests recommended tags of the niche, specific first', () => {
    const tags = [lib('skincare', 'skincare', 'broad'), lib('sunscreenlokal', 'skincare', 'specific'), lib('spam', 'skincare', 'specific', 'blocked'), lib('ootd', 'fashion', 'niche')]
    expect(nicheSuggestions(tags, 'skincare')).toEqual(['sunscreenlokal', 'skincare'])
  })
})
