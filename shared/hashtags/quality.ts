import { CHANNELS } from '../channels/registry'
import type { Platform } from '../channels/types'
import { HASHTAG_PATTERN, isValidTagBody, normalizeTag } from './parse'
import { profileCaption, tagFit } from './relevance'
import type { LibraryTag } from './types'

/** Per-tag findings. Codes are i18n keys under `hashtags.code.*` that say what to do. */
export const TAG_CODES = ['invalidChars', 'numbersOnly', 'tooLong', 'duplicate', 'overLimit', 'generic', 'blocked', 'unrelated'] as const
export type TagCode = (typeof TAG_CODES)[number]

/** Findings about the tags as a set, under `hashtags.setCode.*`. */
export const SET_CODES = ['overLimit', 'allBroad', 'threadsOneTag', 'facebookMany'] as const
export type SetCode = (typeof SET_CODES)[number]

export type TagLevel = 'good' | 'warning' | 'error'

export interface TagCheck {
  tag: string // as written, no '#'
  linked: string // the part the platform turns into a link
  level: TagLevel
  codes: TagCode[]
}

export interface SetIssue {
  code: SetCode
  level: 'warning' | 'error'
  params?: Record<string, string | number>
}

export interface TagQuality {
  tags: TagCheck[]
  issues: SetIssue[]
}

const ERROR_CODES = new Set<TagCode>(['invalidChars', 'numbersOnly', 'overLimit', 'blocked'])
const MAX_TAG_LENGTH = 30
const FACEBOOK_COMFORT = 3
/** Below this many content words the caption says too little to call a tag unrelated. */
const MIN_WORDS_FOR_FIT = 3

/** The smallest tag limit among the chosen platforms that share the caption. */
export function tagLimitFor(platforms: Platform[]): number | undefined {
  const limits = platforms.map(p => CHANNELS[p].maxHashtags).filter((n): n is number => n !== undefined)
  return limits.length ? Math.min(...limits) : undefined
}

/**
 * Pure quality check for a set of tags, shared by the composer (live) and the server (research).
 * `tags` are raw (as typed); `platforms` are the platforms that publish this caption.
 */
export function checkTags(input: { tags: string[], caption: string, platforms: Platform[], library: readonly LibraryTag[] }): TagQuality {
  const { library, platforms } = input
  const profile = profileCaption(input.caption, library)
  const judgeFit = profile.words.size >= MIN_WORDS_FOR_FIT
  const byTag = new Map(library.map(entry => [entry.tag, entry]))
  // Threads gets its own one-tag version from the composer, so it doesn't shrink the shared limit.
  const sharing = platforms.length > 1 ? platforms.filter(p => p !== 'threads') : platforms
  const limit = tagLimitFor(sharing)
  const seen = new Set<string>()
  let linkedCount = 0

  const tags = input.tags.map((raw): TagCheck => {
    const tag = raw.trim().replace(/^#+/, '')
    const linked = (`#${tag}`.match(new RegExp(HASHTAG_PATTERN.source, 'u'))?.[2]) ?? ''
    const key = normalizeTag(linked || tag)
    const codes: TagCode[] = []
    if (!isValidTagBody(tag)) codes.push('invalidChars')
    else if (/^\d+$/.test(tag)) codes.push('numbersOnly')
    if (tag.length > MAX_TAG_LENGTH) codes.push('tooLong')
    if (seen.has(key)) {
      codes.push('duplicate')
    } else if (linked) {
      seen.add(key)
      linkedCount++
      if (limit !== undefined && linkedCount > limit) codes.push('overLimit')
    }
    const entry = byTag.get(key)
    if (entry?.status === 'blocked') codes.push('blocked')
    else if (entry?.status === 'generic') codes.push('generic')
    // A broken or banned tag already has the more useful message.
    if (judgeFit && linked && !codes.includes('invalidChars') && entry?.status !== 'blocked' && tagFit(key, profile, library).score === 0) codes.push('unrelated')
    const level: TagLevel = codes.some(c => ERROR_CODES.has(c)) ? 'error' : codes.length ? 'warning' : 'good'
    return { tag, linked, level, codes }
  })

  const issues: SetIssue[] = []
  const count = seen.size
  if (limit !== undefined && count > limit) issues.push({ code: 'overLimit', level: 'error', params: { max: limit, count } })
  if (platforms.includes('threads') && platforms.length > 1 && count > 1) issues.push({ code: 'threadsOneTag', level: 'warning' })
  if (platforms.includes('facebook') && count > FACEBOOK_COMFORT) issues.push({ code: 'facebookMany', level: 'warning', params: { max: FACEBOOK_COMFORT } })
  const known = [...seen].map(key => byTag.get(key)).filter(Boolean)
  if (count >= 3 && known.length === count && known.every(entry => entry!.breadth === 'broad' || entry!.status === 'generic')) {
    issues.push({ code: 'allBroad', level: 'warning' })
  }
  return { tags, issues }
}
