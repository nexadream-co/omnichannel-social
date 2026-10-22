import type { Platform } from '../channels/types'

export const TAG_NICHES = ['skincare', 'makeup', 'fashion', 'gadget', 'home', 'food', 'mom_baby', 'health_sport', 'hobby', 'general'] as const
export type TagNiche = (typeof TAG_NICHES)[number]

/** `broad` = millions of posts (hard to be seen), `niche` = a topic, `specific` = a product or a precise need. */
export const TAG_BREADTHS = ['broad', 'niche', 'specific'] as const
export type TagBreadth = (typeof TAG_BREADTHS)[number]

/** `generic` = says nothing about the content; `blocked` = spam bait or risky, never suggested. */
export const TAG_STATUSES = ['recommended', 'generic', 'blocked'] as const
export type TagStatus = (typeof TAG_STATUSES)[number]

/** One row of the admin-managed tag list, as the composer receives it. */
export interface LibraryTag {
  tag: string // normal form, no '#'
  niche: TagNiche
  keywords: string[] // content words that make this tag fit
  breadth: TagBreadth
  status: TagStatus
  platforms: Platform[] // empty = every platform
}

/** Public activity of a tag on a platform: posts using it in the last 7 days (counting stops at a cap). */
export interface TagActivity {
  recentPosts: number
  capped: boolean // true = at least `recentPosts`
  lastPostAt: string | null
}

export type ActivityLevel = 'busy' | 'active' | 'quiet' | 'unused'

/** Bands for the badge: busy ≥ 100 posts a week, active ≥ 20, quiet ≥ 1. */
export function activityLevel(activity: TagActivity): ActivityLevel {
  if (activity.recentPosts >= 100) return 'busy'
  if (activity.recentPosts >= 20) return 'active'
  return activity.recentPosts ? 'quiet' : 'unused'
}

/** Back-office labels (staff read Bahasa only). The creator UI uses i18n keys `hashtags.niche.*` instead. */
export const TAG_NICHE_LABELS: Record<TagNiche, string> = {
  skincare: 'Skincare', makeup: 'Makeup', fashion: 'Fashion', gadget: 'Gadget', home: 'Rumah tangga',
  food: 'Makanan & minuman', mom_baby: 'Ibu & anak', health_sport: 'Kesehatan & olahraga', hobby: 'Hobi', general: 'Umum afiliasi'
}
export const TAG_BREADTH_LABELS: Record<TagBreadth, string> = { broad: 'Sangat umum', niche: 'Topik', specific: 'Spesifik' }
export const TAG_STATUS_LABELS: Record<TagStatus, string> = { recommended: 'Disarankan', generic: 'Terlalu umum', blocked: 'Diblokir (spam)' }
