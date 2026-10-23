/** Rencana konten (Kalender planner): ideas, content pillars and shopping moments (docs/ARCHITECTURE.md §8.8). */
import type { MediaView } from '../media/types'

export const CONTENT_PILLARS = ['promo', 'review', 'edukasi', 'hiburan', 'cerita'] as const
export type ContentPillar = (typeof CONTENT_PILLARS)[number]

export const IDEA_STATUSES = ['open', 'used', 'archived'] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export const MOMENT_KINDS = ['twin_date', 'payday', 'holiday', 'campaign'] as const
export type MomentKind = (typeof MOMENT_KINDS)[number]

/** Bank Ide filters: `unplanned` = open ideas not on the calendar yet. */
export const IDEA_VIEWS = ['unplanned', 'planned', 'used', 'archived'] as const
export type IdeaView = (typeof IDEA_VIEWS)[number]

export const PILLAR_META: Record<ContentPillar, { labelKey: string, icon: string }> = {
  promo: { labelKey: 'planner.pillar.promo', icon: 'i-lucide-badge-percent' },
  review: { labelKey: 'planner.pillar.review', icon: 'i-lucide-star' },
  edukasi: { labelKey: 'planner.pillar.edukasi', icon: 'i-lucide-lightbulb' },
  hiburan: { labelKey: 'planner.pillar.hiburan', icon: 'i-lucide-smile' },
  cerita: { labelKey: 'planner.pillar.cerita', icon: 'i-lucide-message-circle-heart' }
}

/** `label` is for /admin (Bahasa only); creators see `labelKey`. */
export const MOMENT_KIND_META: Record<MomentKind, { label: string, labelKey: string, icon: string }> = {
  twin_date: { label: 'Tanggal kembar', labelKey: 'planner.momentKind.twin_date', icon: 'i-lucide-tags' },
  payday: { label: 'Gajian', labelKey: 'planner.momentKind.payday', icon: 'i-lucide-wallet' },
  holiday: { label: 'Hari besar', labelKey: 'planner.momentKind.holiday', icon: 'i-lucide-party-popper' },
  campaign: { label: 'Kampanye belanja', labelKey: 'planner.momentKind.campaign', icon: 'i-lucide-shopping-bag' }
}

export const DEFAULT_POSTS_PER_WEEK = 3
export const MAX_POSTS_PER_WEEK = 21
/** A sanity cap, not a plan limit: the planner is free on every plan. */
export const MAX_OPEN_IDEAS = 500
export const IDEA_TITLE_MAX = 200
export const IDEA_NOTE_MAX = 2000
export const IDEA_MAX_MEDIA = 10
export const IDEA_MAX_LINKS = 5

// ---- Wire shapes (server/core/planner/ideas.ts) ----

/** An open idea on the calendar (GET /api/app/posts/calendar). */
export interface PlannerIdea { id: string, title: string, pillar: ContentPillar | null, plannedOn: string, momentId: string | null }
export interface PlannerMoment { id: string, name: string, nameEn: string | null, kind: MomentKind, startsOn: string, endsOn: string, prepDays: number, prepared: boolean }
export interface IdeaProduct { id: string, title: string | null, merchant: string, imageUrl: string | null, destinationUrl: string, shortUrl: string | null }
export interface IdeaDetail {
  id: string
  title: string
  note: string | null
  pillar: ContentPillar | null
  plannedOn: string | null
  status: IdeaStatus
  postId: string | null
  momentId: string | null
  createdAt: string
  updatedAt: string
  links: IdeaProduct[]
  media: MediaView[]
}

// ---- Local calendar days ('YYYY-MM-DD'), no time zone involved ----

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Monday of the week that holds `day` (the calendar is Monday-first). */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return addDays(day, -((d.getUTCDay() + 6) % 7))
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** "2/3 terisi": posts and planned ideas both count toward the weekly target; days with neither are open slots. */
export function weekFill(days: string[], filled: Map<string, number>, target: number, today: string) {
  const count = days.reduce((sum, day) => sum + (filled.get(day) ?? 0), 0)
  return {
    count,
    target,
    reached: count >= target,
    emptyDays: count >= target ? [] : days.filter(day => day >= today && !filled.get(day))
  }
}

// ---- "Siapkan konten" for a moment: three dated idea skeletons ----

type Locale = 'id' | 'en'
interface PackItem { offset: number | 'prep', pillar: ContentPillar, title: Record<Locale, string> }

/** `{momen}` is the moment's name. `'prep'` lands `prepDays` before the moment starts. */
const PACKS: Record<'sale' | 'payday' | 'holiday', PackItem[]> = {
  sale: [
    { offset: 'prep', pillar: 'cerita', title: { id: 'Teaser {momen}: spill produk yang lagi aku incar', en: '{momen} teaser: the products I\'m eyeing' } },
    { offset: -1, pillar: 'review', title: { id: 'Review jujur sebelum {momen}: worth it nggak?', en: 'Honest review before {momen}: worth it?' } },
    { offset: 0, pillar: 'promo', title: { id: 'Hari H {momen}: checkout sekarang sebelum kehabisan', en: '{momen} is here: check out before it sells out' } }
  ],
  payday: [
    { offset: 0, pillar: 'promo', title: { id: 'Gajian! Rekomendasi belanja di bawah Rp100 ribu', en: 'Payday! Picks under Rp100k' } },
    { offset: 1, pillar: 'review', title: { id: 'Barang yang paling worth it dibeli pas gajian', en: 'The most worth-it buys for payday' } },
    { offset: 3, pillar: 'edukasi', title: { id: 'Tips belanja hemat biar gaji nggak cepat habis', en: 'Smart shopping tips so your pay lasts' } }
  ],
  holiday: [
    { offset: 'prep', pillar: 'edukasi', title: { id: 'Persiapan {momen}: checklist belanja', en: '{momen} prep: shopping checklist' } },
    { offset: -2, pillar: 'review', title: { id: 'Ide hadiah dan perlengkapan {momen}', en: '{momen} gift and essentials ideas' } },
    { offset: 0, pillar: 'promo', title: { id: 'Selamat {momen}! Promo yang masih bisa dikejar', en: 'Happy {momen}! Deals you can still catch' } }
  ]
}

const PACK_OF: Record<MomentKind, keyof typeof PACKS> = { twin_date: 'sale', campaign: 'sale', payday: 'payday', holiday: 'holiday' }

export interface MomentLike { name: string, nameEn?: string | null, kind: MomentKind, startsOn: string, prepDays: number }

export function momentName(moment: Pick<MomentLike, 'name' | 'nameEn'>, locale: string): string {
  return locale === 'en' && moment.nameEn ? moment.nameEn : moment.name
}

/** Dates already gone move to today, so preparing late still gives three ideas to work with. */
export function momentIdeaSkeletons(moment: MomentLike, today: string, locale: Locale = 'id') {
  const name = momentName(moment, locale)
  return PACKS[PACK_OF[moment.kind]].map((item) => {
    const day = addDays(moment.startsOn, item.offset === 'prep' ? -Math.max(1, moment.prepDays) : item.offset)
    return { title: item.title[locale].replaceAll('{momen}', name), pillar: item.pillar, plannedOn: day < today ? today : day }
  })
}

// ---- Seed: shipped by migration 0010 and scripts/seed.ts with the same ids; /admin/moments owns them after ----

export interface SeedMoment { id: string, name: string, nameEn: string, kind: MomentKind, startsOn: string, endsOn: string, prepDays: number }

const pad = (n: number) => String(n).padStart(2, '0')

function twinDates(): SeedMoment[] {
  const list: SeedMoment[] = []
  for (const [year, from] of [[2026, 11], [2027, 1]] as const) {
    for (let m: number = from; m <= 12; m++) {
      const day = `${year}-${pad(m)}-${pad(m)}`
      const label = `${m}.${m}`
      const harbolnas = m === 12
      list.push({
        id: `moment-${pad(m)}${pad(m)}-${year}`,
        name: harbolnas ? `Promo ${label} Harbolnas` : `Promo ${label}`,
        nameEn: harbolnas ? `${label} Harbolnas` : `${label} Sale`,
        kind: 'twin_date', startsOn: day, endsOn: day, prepDays: harbolnas ? 5 : 3
      })
    }
  }
  return list
}

/** Gajian: the 25th until the 1st of the next month, when most salaries land. */
function paydays(): SeedMoment[] {
  const list: SeedMoment[] = []
  for (let i = 0; i < 15; i++) {
    const start = new Date(Date.UTC(2026, 9 + i, 25))
    const end = new Date(Date.UTC(2026, 10 + i, 1))
    const ym = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}`
    list.push({ id: `moment-gajian-${ym}`, name: 'Gajian', nameEn: 'Payday', kind: 'payday', startsOn: start.toISOString().slice(0, 10), endsOn: end.toISOString().slice(0, 10), prepDays: 2 })
  }
  return list
}

/** Islamic dates follow the government calendar estimate; staff correct them in /admin/moments when it's announced. */
const OTHER: SeedMoment[] = [
  { id: 'moment-blackfriday-2026', name: 'Black Friday', nameEn: 'Black Friday', kind: 'campaign', startsOn: '2026-11-27', endsOn: '2026-11-30', prepDays: 3 },
  { id: 'moment-hariibu-2026', name: 'Hari Ibu', nameEn: 'Mother\'s Day', kind: 'holiday', startsOn: '2026-12-22', endsOn: '2026-12-22', prepDays: 5 },
  { id: 'moment-natal-2026', name: 'Natal', nameEn: 'Christmas', kind: 'holiday', startsOn: '2026-12-25', endsOn: '2026-12-25', prepDays: 7 },
  { id: 'moment-imlek-2027', name: 'Imlek', nameEn: 'Chinese New Year', kind: 'holiday', startsOn: '2027-02-06', endsOn: '2027-02-06', prepDays: 7 },
  { id: 'moment-ramadan-2027', name: 'Ramadan', nameEn: 'Ramadan', kind: 'holiday', startsOn: '2027-02-08', endsOn: '2027-03-09', prepDays: 7 },
  { id: 'moment-valentine-2027', name: 'Valentine', nameEn: 'Valentine\'s Day', kind: 'holiday', startsOn: '2027-02-14', endsOn: '2027-02-14', prepDays: 5 },
  { id: 'moment-lebaran-2027', name: 'Lebaran', nameEn: 'Eid al-Fitr', kind: 'holiday', startsOn: '2027-03-10', endsOn: '2027-03-11', prepDays: 14 },
  { id: 'moment-iduladha-2027', name: 'Iduladha', nameEn: 'Eid al-Adha', kind: 'holiday', startsOn: '2027-05-17', endsOn: '2027-05-17', prepDays: 5 },
  { id: 'moment-sekolah-2027', name: 'Tahun ajaran baru', nameEn: 'Back to school', kind: 'campaign', startsOn: '2027-07-12', endsOn: '2027-07-18', prepDays: 7 },
  { id: 'moment-hutri-2027', name: 'HUT RI', nameEn: 'Independence Day', kind: 'holiday', startsOn: '2027-08-17', endsOn: '2027-08-17', prepDays: 5 },
  { id: 'moment-blackfriday-2027', name: 'Black Friday', nameEn: 'Black Friday', kind: 'campaign', startsOn: '2027-11-26', endsOn: '2027-11-29', prepDays: 3 },
  { id: 'moment-hariibu-2027', name: 'Hari Ibu', nameEn: 'Mother\'s Day', kind: 'holiday', startsOn: '2027-12-22', endsOn: '2027-12-22', prepDays: 5 },
  { id: 'moment-natal-2027', name: 'Natal', nameEn: 'Christmas', kind: 'holiday', startsOn: '2027-12-25', endsOn: '2027-12-25', prepDays: 7 }
]

export const SEED_MOMENTS: SeedMoment[] = [...twinDates(), ...paydays(), ...OTHER].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id))
