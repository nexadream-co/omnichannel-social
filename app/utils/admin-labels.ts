/** Label maps for the back-office (Bahasa only): no raw enum value is ever shown (CLAUDE.md rule 13). */
type Color = 'success' | 'info' | 'warning' | 'neutral' | 'error' | 'primary'

export const SUBSCRIPTION_STATUS: Record<string, { label: string, color: Color }> = {
  trialing: { label: 'Uji coba', color: 'info' },
  active: { label: 'Aktif', color: 'success' },
  past_due: { label: 'Masa tenggang', color: 'warning' },
  cancelled: { label: 'Dibatalkan', color: 'neutral' },
  downgraded: { label: 'Gratis', color: 'neutral' },
  suspended: { label: 'Ditangguhkan', color: 'error' }
}

export const PAYMENT_STATUS: Record<string, { label: string, color: Color }> = {
  pending: { label: 'Menunggu', color: 'info' },
  paid: { label: 'Lunas', color: 'success' },
  failed: { label: 'Gagal', color: 'error' },
  expired: { label: 'Kedaluwarsa', color: 'neutral' },
  refunded: { label: 'Dikembalikan', color: 'warning' },
  cancelled: { label: 'Dibatalkan', color: 'neutral' },
  challenge: { label: 'Diperiksa', color: 'warning' }
}

export const WORKSPACE_STATUS: Record<string, { label: string, color: Color }> = {
  active: { label: 'Aktif', color: 'success' },
  suspended: { label: 'Ditangguhkan', color: 'error' },
  deleted: { label: 'Dihapus', color: 'neutral' }
}

export const ACCOUNT_STATUS: Record<string, { label: string, color: Color }> = {
  active: { label: 'Aktif', color: 'success' },
  needs_reauth: { label: 'Perlu dihubungkan ulang', color: 'warning' },
  disabled: { label: 'Nonaktif (batas paket)', color: 'neutral' },
  revoked: { label: 'Diputus', color: 'neutral' }
}

export const TARGET_STATUS: Record<string, { label: string, color: Color }> = {
  draft: { label: 'Draf', color: 'neutral' },
  scheduled: { label: 'Terjadwal', color: 'info' },
  preparing: { label: 'Disiapkan', color: 'info' },
  processing: { label: 'Diproses', color: 'info' },
  publishing: { label: 'Diterbitkan', color: 'info' },
  published: { label: 'Terbit', color: 'success' },
  publish_unknown: { label: 'Belum pasti', color: 'warning' },
  retrying: { label: 'Dicoba lagi', color: 'warning' },
  quota_deferred: { label: 'Ditunda (kuota)', color: 'warning' },
  needs_reauth: { label: 'Akun perlu dihubungkan', color: 'warning' },
  failed: { label: 'Gagal', color: 'error' },
  cancelled: { label: 'Dibatalkan', color: 'neutral' }
}

export const MEMBER_ROLE: Record<string, string> = { owner: 'Pemilik', editor: 'Editor', viewer: 'Pemantau' }
export const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', threads: 'Threads', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X' }
export const PERIOD_LABEL: Record<string, string> = { monthly: 'bulanan', yearly: 'tahunan' }

export function statusOf(map: Record<string, { label: string, color: Color }>, key: string | null | undefined) {
  return (key && map[key]) || { label: key ?? '—', color: 'neutral' as Color }
}
