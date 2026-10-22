import { describe, expect, it } from 'vitest'
import { CHANNELS } from '../../shared/channels/registry'
import { validateTarget } from '../../shared/channels/validate'
import { SEED_HASHTAGS } from '../../shared/hashtags/library-seed'
import { countTags, extractRawTags, extractTags, insertTags, normalizeTag, removeTag, splitCompound } from '../../shared/hashtags/parse'
import { checkTags } from '../../shared/hashtags/quality'
import { suggestFromLibrary, tagFit, profileCaption } from '../../shared/hashtags/relevance'
import { contentWords } from '../../shared/hashtags/tokenize'

const library = SEED_HASHTAGS
const jpeg = { kind: 'image' as const, mime: 'image/jpeg', bytes: 1000, width: 1080, height: 1350 }
const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i}`).join(' ')

describe('channel tag limits', () => {
  it('allows 5 tags on Instagram and counts the first comment', () => {
    const codes = (caption: string, firstComment?: string) => validateTarget(CHANNELS.instagram, { format: 'feed', caption, firstComment }, [jpeg]).map(i => i.code)
    expect(codes(tags(5))).not.toContain('channel.tooManyHashtags')
    expect(codes(tags(6))).toContain('channel.tooManyHashtags')
    expect(codes(tags(3), '#a #b #c')).toContain('channel.tooManyHashtags')
  })
  it('keeps Threads at one tag and ignores the first comment there', () => {
    const codes = (caption: string, firstComment?: string) => validateTarget(CHANNELS.threads, { format: 'text', caption, firstComment }, []).map(i => i.code)
    expect(codes('halo #satu', '#dua #tiga')).not.toContain('channel.tooManyHashtags')
    expect(codes('halo #satu #dua')).toContain('channel.tooManyHashtags')
  })
})

describe('parse', () => {
  it('extracts linked and raw tags', () => {
    expect(extractTags('Serum #SkinCare, #skin-care dan https://s.id/a#frag')).toEqual(['SkinCare', 'skin'])
    expect(extractRawTags('Serum #SkinCare, #skin-care. #ok!')).toEqual(['SkinCare', 'skin-care', 'ok'])
    expect(countTags('#a #b x#c')).toBe(2)
    expect(normalizeTag('  ##SkinCare ')).toBe('skincare')
  })
  it('inserts at the end, joins an existing tag line and skips duplicates', () => {
    expect(insertTags('Serum bagus', ['serum', '#Glow'])).toBe('Serum bagus\n\n#serum #Glow')
    expect(insertTags('Serum bagus\n\n#serum', ['SERUM', 'glow'])).toBe('Serum bagus\n\n#serum #glow')
    expect(insertTags('Cek https://s.id/abc', ['murah'])).toBe('Cek https://s.id/abc\n\n#murah')
    expect(insertTags('', ['a', 'bad tag'])).toBe('#a')
  })
  it('removes a tag in any casing and tidies the caption', () => {
    expect(removeTag('Serum bagus\n\n#serum #glow', 'SERUM')).toBe('Serum bagus\n\n#glow')
    expect(removeTag('Serum bagus\n\n#glow', 'glow')).toBe('Serum bagus')
    expect(removeTag('#glowing #glow', 'glow')).toBe('#glowing')
  })
  it('splits joined tags into known words', () => {
    const vocab = new Set(['racun', 'skincare', 'murah', 'skin', 'care'])
    expect(splitCompound('racunskincaremurah', vocab)).toEqual(['racun', 'skincare', 'murah'])
    expect(splitCompound('xyz', vocab)).toEqual([])
  })
  it('keeps content words and drops filler, links and tags', () => {
    const words = contentWords('Aku suka bgt serumnya! Cek link https://s.id/x #serum @teman')
    expect(words.has('serumnya')).toBe(true)
    expect(words.has('serum')).toBe(true) // stemmed from serumnya; the tag itself is not counted
    expect(words.has('aku')).toBe(false)
    expect(words.has('link')).toBe(false)
  })
})

describe('relevance', () => {
  const skincare = 'Sunscreen ini ringan banget, cocok buat kulit berminyak dan nggak bikin jerawat. Harga murah!'
  const gadget = 'Powerbank 20000mAh murah, bisa ngecas hp dua kali penuh. Kabel sudah termasuk.'
  it('finds the niche of a caption', () => {
    expect(profileCaption(skincare, library).niche).toBe('skincare')
    expect(profileCaption(gadget, library).niche).toBe('gadget')
  })
  it('suggests skincare tags for a skincare caption and not gadget ones', () => {
    const tags = suggestFromLibrary(skincare, library).map(s => s.tag)
    expect(tags).toContain('sunscreen')
    expect(tags).toContain('kulitberminyak')
    expect(tags.some(tag => ['gadget', 'powerbank', 'hpmurah'].includes(tag))).toBe(false)
    expect(tags).not.toContain('fyp')
    expect(tags).not.toContain('barangunik') // general tags need the caption to say so
    expect(suggestFromLibrary('Racun shopee: sunscreen murah meriah', library).map(s => s.tag)).toContain('racunshopee')
    expect(suggestFromLibrary(skincare, library).filter(s => s.breadth === 'broad').length).toBeLessThanOrEqual(1)
  })
  it('does not let a shared word pull in another niche', () => {
    const profile = profileCaption(gadget, library)
    expect(tagFit('skincaremurah', profile, library).score).toBe(0)
    expect(tagFit('powerbank', profile, library).score).toBe(1)
    expect(tagFit('powerbankmurah', profile, library).score).toBe(1) // not in the list: split into known words
  })
  it('returns nothing for an empty caption', () => {
    expect(suggestFromLibrary('', library)).toEqual([])
  })
})

describe('checkTags', () => {
  const caption = 'Sunscreen ringan untuk kulit berminyak, nggak lengket dan nggak bikin jerawat.'
  const run = (tags: string[], platforms: ('instagram' | 'threads' | 'facebook')[] = ['instagram']) => checkTags({ tags, caption, platforms, library })
  const codesOf = (tags: string[], platforms?: ('instagram' | 'threads' | 'facebook')[]) => run(tags, platforms).tags.map(t => t.codes)
  it('flags broken, numeric, long and duplicate tags', () => {
    expect(codesOf(['skin-care'])[0]).toContain('invalidChars')
    expect(run(['skin-care']).tags[0]!.linked).toBe('skin')
    expect(codesOf(['2024'])[0]).toContain('numbersOnly')
    expect(codesOf(['a'.repeat(31)])[0]).toContain('tooLong')
    expect(codesOf(['sunscreen', 'Sunscreen'])[1]).toContain('duplicate')
  })
  it('uses the tag list for generic and blocked tags', () => {
    expect(codesOf(['fyp'])[0]).toContain('generic')
    expect(run(['f4f']).tags[0]!.level).toBe('error')
  })
  it('flags tags that do not fit the caption', () => {
    expect(codesOf(['powerbank'])[0]).toContain('unrelated')
    expect(codesOf(['sunscreen'])[0]).toEqual([])
    expect(run(['sunscreen']).tags[0]!.level).toBe('good')
  })
  it('marks tags past the platform limit and set-level issues', () => {
    const six = ['sunscreen', 'kulitberminyak', 'jerawat', 'skincare', 'skincareindonesia', 'skincareroutine']
    const result = run(six)
    expect(result.tags[5]!.codes).toContain('overLimit')
    expect(result.issues.map(i => i.code)).toContain('overLimit')
    expect(run(['sunscreen', 'jerawat'], ['instagram', 'threads']).issues.map(i => i.code)).toContain('threadsOneTag')
    expect(run(['sunscreen', 'jerawat'], ['instagram', 'threads']).tags.every(t => !t.codes.includes('overLimit'))).toBe(true)
    expect(run(['fyp', 'viral', 'skincare']).issues.map(i => i.code)).toContain('allBroad')
    expect(run(['a', 'b', 'c', 'd'], ['facebook']).issues.map(i => i.code)).toContain('facebookMany')
  })
})
