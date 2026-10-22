export const LIMIT_KEYS = [
  'socialAccounts',
  'scheduledPostsPerMonth',
  'bioPages',
  'autoReplyRules',
  'autoReplyDmsPerMonth',
  'clickRetentionDays',
  'teamMembers',
  'mediaStorageMb',
  'activityLogRetentionDays',
  'tagResearchPerMonth'
] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

export const FEATURE_KEYS = [
  'removeBranding',
  'customSlug',
  'anyDestination',
  'analyticsExport',
  'teamAccess',
  'activityLog',
  'prioritySupport'
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

export type PlanLimits = Record<LimitKey, number>
export type PlanFeatures = Record<FeatureKey, boolean>

export const UNLIMITED = -1

export const LIMIT_META: Record<LimitKey, { label: string, sentence: string, hint: string, unit?: string }> = {
  socialAccounts: { label: 'Akun media sosial', sentence: 'akun media sosial', hint: 'Instagram, Threads dan Halaman Facebook masing-masing dihitung 1.', unit: 'akun' },
  scheduledPostsPerMonth: { label: 'Postingan per bulan', sentence: 'postingan terjadwal per bulan', hint: 'Satu postingan ke 3 akun dihitung 3.', unit: 'postingan' },
  bioPages: { label: 'Halaman Etalase', sentence: 'halaman Etalase', hint: '', unit: 'halaman' },
  autoReplyRules: { label: 'Aturan Balas Otomatis', sentence: 'aturan Balas Otomatis aktif', hint: '', unit: 'aturan' },
  autoReplyDmsPerMonth: { label: 'DM otomatis per bulan', sentence: 'DM otomatis per bulan', hint: '', unit: 'DM' },
  clickRetentionDays: { label: 'Riwayat statistik', sentence: 'hari riwayat statistik', hint: 'Seberapa jauh ke belakang statistik klik bisa dilihat.', unit: 'hari' },
  teamMembers: { label: 'Anggota tim', sentence: 'anggota tim', hint: 'Termasuk pemilik.', unit: 'orang' },
  mediaStorageMb: { label: 'Penyimpanan media', sentence: 'MB penyimpanan media', hint: '', unit: 'MB' },
  activityLogRetentionDays: { label: 'Riwayat log aktivitas', sentence: 'hari riwayat log aktivitas', hint: '', unit: 'hari' },
  tagResearchPerMonth: { label: 'Riset tagar per bulan', sentence: 'riset tagar per bulan', hint: 'Tiap kali tombol "Riset" dipakai untuk satu keterangan. Cek kualitas tagar selalu gratis.', unit: 'riset' }
}

export const FEATURE_META: Record<FeatureKey, { label: string, hint: string }> = {
  removeBranding: { label: 'Tanpa tulisan "dibuat dengan Socialz.id"', hint: 'Etalase tampil tanpa merek Socialz.id.' },
  customSlug: { label: 'Nama link pendek sendiri', hint: 'Pilih sendiri nama link pendek kamu.' },
  anyDestination: { label: 'Link ke situs mana saja', hint: 'Tidak terbatas pada toko afiliasi.' },
  analyticsExport: { label: 'Unduh statistik (CSV)', hint: '' },
  teamAccess: { label: 'Akses tim', hint: 'Undang editor atau pemantau.' },
  activityLog: { label: 'Log aktivitas', hint: 'Lihat siapa melakukan apa di akun kamu.' },
  prioritySupport: { label: 'Dukungan prioritas', hint: '' }
}

/** Conservative values for keys a stored plan predates (the free tier's values). */
export const DEFAULT_LIMITS: PlanLimits = {
  socialAccounts: 2,
  scheduledPostsPerMonth: 20,
  bioPages: 1,
  autoReplyRules: 1,
  autoReplyDmsPerMonth: 100,
  clickRetentionDays: 30,
  teamMembers: 1,
  mediaStorageMb: 500,
  activityLogRetentionDays: 0,
  tagResearchPerMonth: 0
}

export const DEFAULT_FEATURES: PlanFeatures = Object.fromEntries(FEATURE_KEYS.map(key => [key, false])) as PlanFeatures

export function normalizeLimits(raw: unknown): PlanLimits {
  const out: PlanLimits = { ...DEFAULT_LIMITS }
  if (raw && typeof raw === 'object') {
    for (const key of LIMIT_KEYS) {
      const value = (raw as Record<string, unknown>)[key]
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.trunc(value)
    }
  }
  return out
}

export function normalizeFeatures(raw: unknown): PlanFeatures {
  const out: PlanFeatures = { ...DEFAULT_FEATURES }
  if (raw && typeof raw === 'object') {
    for (const key of FEATURE_KEYS) {
      const value = (raw as Record<string, unknown>)[key]
      if (typeof value === 'boolean') out[key] = value
    }
  }
  return out
}

export function formatLimit(key: LimitKey, value: number): string {
  if (value === UNLIMITED) return 'Tanpa batas'
  const unit = LIMIT_META[key].unit
  return `${new Intl.NumberFormat('id-ID').format(value)}${unit ? ` ${unit}` : ''}`
}

export interface SeedPlan {
  slug: string
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  trialDays: number
  isActive: boolean
  isPublic: boolean
  order: number
  limits: PlanLimits
  features: PlanFeatures
}

/** Seed values (docs/blueprint/06 §2.1). After seeding, the DB is the source of truth (/admin/plans). */
export const SEED_PLANS: SeedPlan[] = [
  {
    slug: 'gratis', name: 'Gratis', description: 'Untuk mulai belajar jualan afiliasi.',
    priceMonthly: 0, priceYearly: 0, trialDays: 0, isActive: true, isPublic: true, order: 0,
    limits: { ...DEFAULT_LIMITS },
    features: { ...DEFAULT_FEATURES }
  },
  {
    slug: 'kreator', name: 'Kreator', description: 'Untuk kreator yang rutin posting dan jualan.',
    priceMonthly: 49_000, priceYearly: 490_000, trialDays: 14, isActive: true, isPublic: true, order: 1,
    limits: { socialAccounts: 5, scheduledPostsPerMonth: 300, bioPages: 1, autoReplyRules: 10, autoReplyDmsPerMonth: 1_000, clickRetentionDays: 180, teamMembers: 1, mediaStorageMb: 5_000, activityLogRetentionDays: 30, tagResearchPerMonth: 100 },
    features: { removeBranding: true, customSlug: true, anyDestination: true, analyticsExport: true, teamAccess: false, activityLog: true, prioritySupport: false }
  },
  {
    slug: 'pro', name: 'Pro', description: 'Untuk kreator dengan banyak akun dan tim kecil.',
    priceMonthly: 99_000, priceYearly: 990_000, trialDays: 14, isActive: false, isPublic: false, order: 2,
    limits: { socialAccounts: 12, scheduledPostsPerMonth: 1_500, bioPages: 3, autoReplyRules: UNLIMITED, autoReplyDmsPerMonth: 5_000, clickRetentionDays: 365, teamMembers: 3, mediaStorageMb: 20_000, activityLogRetentionDays: 90, tagResearchPerMonth: UNLIMITED },
    features: { removeBranding: true, customSlug: true, anyDestination: true, analyticsExport: true, teamAccess: true, activityLog: true, prioritySupport: true }
  }
]
