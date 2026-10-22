import type { Platform } from '../channels/types'
import { normalizeTag, splitCompound } from './parse'
import { contentWords } from './tokenize'
import type { LibraryTag, TagBreadth, TagNiche } from './types'

/**
 * Rule-based fit between a caption and a tag (no AI): a tag fits when one of its words, or one of
 * its keywords in the tag list, appears in the caption. A tag from the caption's main niche fits
 * a little. Approximate on purpose; the UI says "cocok" (fits), never "pasti ramai" (sure to trend).
 */
export interface CaptionProfile {
  words: Set<string>
  vocabulary: Set<string>
  niche: TagNiche | null
}

export interface TagFit {
  score: number // 1 = a word matches, 0.5 = same niche or a general affiliate tag, 0 = no link found
  matched: string[]
}

export interface LibraryIndex {
  byTag: Map<string, LibraryTag>
  byKeyword: Map<string, Set<TagNiche>>
  vocabulary: Set<string>
}

const indexes = new WeakMap<readonly LibraryTag[], LibraryIndex>()

export function indexLibrary(library: readonly LibraryTag[]): LibraryIndex {
  const hit = indexes.get(library)
  if (hit) return hit
  const index: LibraryIndex = { byTag: new Map(), byKeyword: new Map(), vocabulary: new Set() }
  for (const entry of library) {
    index.byTag.set(entry.tag, entry)
    if (entry.tag.length >= 2) index.vocabulary.add(entry.tag)
    for (const keyword of entry.keywords) {
      index.vocabulary.add(keyword)
      if (!index.byKeyword.has(keyword)) index.byKeyword.set(keyword, new Set())
      index.byKeyword.get(keyword)!.add(entry.niche)
    }
  }
  indexes.set(library, index)
  return index
}

export function profileCaption(caption: string, library: readonly LibraryTag[]): CaptionProfile {
  const index = indexLibrary(library)
  const words = contentWords(caption)
  const scores = new Map<TagNiche, number>()
  for (const entry of library) {
    if (entry.status === 'blocked' || entry.niche === 'general') continue
    const hits = entry.keywords.filter(k => words.has(k)).length + (words.has(entry.tag) ? 1 : 0)
    if (hits) scores.set(entry.niche, (scores.get(entry.niche) ?? 0) + hits)
  }
  const niche = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
  return { words, vocabulary: new Set([...index.vocabulary, ...words]), niche }
}

export function tagFit(tag: string, profile: CaptionProfile, library: readonly LibraryTag[]): TagFit {
  const index = indexLibrary(library)
  const key = normalizeTag(tag)
  const entry = index.byTag.get(key)
  const parts = [key, ...splitCompound(key, profile.vocabulary)]
  const terms = new Set([...parts, ...(entry?.keywords ?? [])])
  const matched = [...terms].filter(term => profile.words.has(term))
  // A tag from another niche needs a word only that niche uses: "murah" in a gadget caption must
  // not make #skincaremurah fit, but "sunscreen" makes #sunscreen fit anywhere.
  const sameNiche = !entry || entry.niche === 'general' || entry.niche === profile.niche
  const strong = sameNiche ? matched : matched.filter(word => word === key || index.byKeyword.get(word)?.size === 1)
  if (strong.length) return { score: 1, matched }
  if (entry?.niche === 'general' && entry.status === 'recommended' && profile.words.size) return { score: 0.5, matched: [] }
  if (profile.niche) {
    if (entry?.niche === profile.niche) return { score: 0.5, matched: [] }
    if (!entry && parts.some(part => index.byKeyword.get(part)?.has(profile.niche!))) return { score: 0.5, matched: [] }
  }
  return { score: 0, matched: [] }
}

export interface Suggestion {
  tag: string
  niche: TagNiche
  breadth: TagBreadth
  score: number
  matched: string[]
}

const BREADTH_RANK: Record<TagBreadth, number> = { specific: 0, niche: 1, broad: 2 }

/** Ranked tags from the list for a caption: best fit first, specific before broad, at most one broad and two general tags. */
export function suggestFromLibrary(caption: string, library: readonly LibraryTag[], options: { platforms?: Platform[], exclude?: string[], limit?: number } = {}): Suggestion[] {
  const profile = profileCaption(caption, library)
  if (!profile.words.size) return []
  const exclude = new Set((options.exclude ?? []).map(normalizeTag))
  const platforms = options.platforms ?? []
  const scored = library
    .filter(entry => entry.status === 'recommended' && !exclude.has(entry.tag))
    .filter(entry => !entry.platforms.length || !platforms.length || platforms.some(p => entry.platforms.includes(p)))
    .map(entry => ({ entry, fit: tagFit(entry.tag, profile, library) }))
    // General affiliate tags (#racunshopee) pass the quality check anywhere, but are only suggested when the caption says so.
    .filter(({ entry, fit }) => entry.niche === 'general' ? fit.score === 1 : fit.score > 0)
    .sort((a, b) => b.fit.score - a.fit.score || b.fit.matched.length - a.fit.matched.length || BREADTH_RANK[a.entry.breadth] - BREADTH_RANK[b.entry.breadth] || a.entry.tag.localeCompare(b.entry.tag))
  const out: Suggestion[] = []
  let broad = 0
  let general = 0
  for (const { entry, fit } of scored) {
    if (out.length >= (options.limit ?? 12)) break
    if (entry.breadth === 'broad' && broad++ >= 1) continue
    if (entry.niche === 'general' && general++ >= 2) continue
    out.push({ tag: entry.tag, niche: entry.niche, breadth: entry.breadth, score: fit.score, matched: fit.matched })
  }
  return out
}
