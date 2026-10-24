import { TAG_NICHES, type LibraryTag, type TagNiche } from '../../shared/hashtags/types'

/** The workspace's free-text niche ("Skincare", "mom baby") matched to a tag-list niche, or null. */
export function matchNiche(text: string | null | undefined): TagNiche | null {
  const value = (text ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!value) return null
  const exact = TAG_NICHES.find(n => n === value)
  if (exact) return exact
  return TAG_NICHES.find(n => n !== 'general' && n.length >= 5 && value.includes(n)) ?? null
}

const BREADTH_RANK = { specific: 0, niche: 1, broad: 2 } as const

/** Tags to offer before any caption exists: the niche's recommended tags, specific ones first. */
export function nicheSuggestions(library: readonly LibraryTag[], niche: TagNiche, platforms: string[] = [], limit = 12): string[] {
  return library
    .filter(entry => entry.niche === niche && entry.status === 'recommended')
    .filter(entry => !entry.platforms.length || !platforms.length || platforms.some(p => (entry.platforms as string[]).includes(p)))
    .sort((a, b) => BREADTH_RANK[a.breadth] - BREADTH_RANK[b.breadth] || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map(entry => entry.tag)
}
