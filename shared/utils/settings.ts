export type SettingType = 'string' | 'number' | 'boolean' | 'json' | 'secret' | 'text' | 'select'

export const SETTING_GROUPS = ['company', 'email', 'billing', 'privacy', 'app', 'channels'] as const
export type SettingGroup = (typeof SETTING_GROUPS)[number]

export interface SettingDef {
  key: string
  group: SettingGroup
  type: SettingType
  label: string
  hint?: string
  default: string
  isSecret?: boolean
  options?: { value: string, label: string }[]
}

export const SETTING_GROUP_META: Record<SettingGroup, { label: string, description: string, icon: string }> = {
  company: { label: 'Perusahaan', description: 'Identitas yang tampil di situs, email dan faktur.', icon: 'i-lucide-building' },
  email: { label: 'Email keluar', description: 'Pengirim email lewat Resend. Kosongkan kunci API untuk mematikan pengiriman email.', icon: 'i-lucide-mail' },
  billing: { label: 'Penagihan', description: 'Aturan uji coba, masa tenggang, pengingat perpanjangan dan penurunan paket.', icon: 'i-lucide-credit-card' },
  privacy: { label: 'Privasi & data', description: 'Kebijakan penyimpanan data kreator dan pengunjung.', icon: 'i-lucide-shield-check' },
  app: { label: 'Aplikasi', description: 'Perilaku aplikasi web.', icon: 'i-lucide-settings-2' },
  channels: { label: 'Kanal & otomasi', description: 'Saklar darurat publikasi dan Balas Otomatis, serta daftar domain afiliasi.', icon: 'i-lucide-radio-tower' }
}

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB (Asia/Jakarta)' },
  { value: 'Asia/Makassar', label: 'WITA (Asia/Makassar)' },
  { value: 'Asia/Jayapura', label: 'WIT (Asia/Jayapura)' }
]

const AFFILIATE_ALLOWLIST = ['shopee.co.id', 's.shopee.co.id', 'shope.ee', 'tokopedia.com', 'tokopedia.link', 'tiktok.com', 'vt.tokopedia.com', 'lazada.co.id', 's.lazada.co.id']

export const SETTINGS_CATALOG: SettingDef[] = [
  // company
  { key: 'company.name', group: 'company', type: 'string', label: 'Nama brand', hint: 'Juga dipakai sebagai nama pengirim email.', default: 'Socialz.id' },
  { key: 'company.tagline', group: 'company', type: 'string', label: 'Tagline', default: 'Jadwalkan konten, kumpulkan link produk, balas komentar otomatis.' },
  { key: 'company.legalName', group: 'company', type: 'string', label: 'Nama badan usaha', hint: 'Dicetak di faktur dan halaman legal.', default: '' },
  { key: 'company.email', group: 'company', type: 'string', label: 'Email kontak & dukungan', default: 'halo@socialz.id' },
  { key: 'company.phone', group: 'company', type: 'string', label: 'Telepon', default: '' },
  { key: 'company.address', group: 'company', type: 'text', label: 'Alamat', default: '' },
  { key: 'company.whatsapp', group: 'company', type: 'string', label: 'WhatsApp dukungan', hint: 'Format 62xxxx tanpa +. Kosongkan untuk menyembunyikan tombol WhatsApp.', default: '' },
  { key: 'company.logoUrl', group: 'company', type: 'string', label: 'URL logo', hint: 'Dipakai di kepala email.', default: '' },
  { key: 'company.instagram', group: 'company', type: 'string', label: 'Instagram', default: '' },
  { key: 'company.threads', group: 'company', type: 'string', label: 'Threads', default: '' },
  { key: 'company.tiktok', group: 'company', type: 'string', label: 'TikTok', default: '' },
  { key: 'company.youtube', group: 'company', type: 'string', label: 'YouTube', default: '' },
  // email
  { key: 'email.resendApiKey', group: 'email', type: 'secret', label: 'Kunci API Resend', hint: 'Kosong = email tidak dikirim.', default: '', isSecret: true },
  { key: 'email.fromName', group: 'email', type: 'string', label: 'Nama pengirim', default: 'Socialz.id' },
  { key: 'email.fromEmail', group: 'email', type: 'string', label: 'Email pengirim', hint: 'Harus di domain yang sudah diverifikasi di Resend.', default: 'halo@socialz.id' },
  { key: 'email.replyTo', group: 'email', type: 'string', label: 'Balas ke', hint: 'Kosong = sama dengan email kontak.', default: '' },
  // billing
  { key: 'billing.gracePeriodDays', group: 'billing', type: 'number', label: 'Masa tenggang (hari)', default: '3' },
  { key: 'billing.trialReminderDays', group: 'billing', type: 'number', label: 'Pengingat uji coba (hari sebelum berakhir)', default: '3' },
  { key: 'billing.renewalReminderDays', group: 'billing', type: 'string', label: 'Pengingat perpanjangan', hint: 'Hari sebelum paket berakhir, dipisah koma.', default: '7,3,1' },
  { key: 'billing.trialPlanSlug', group: 'billing', type: 'string', label: 'Paket uji coba', default: 'kreator' },
  { key: 'billing.defaultPlanSlug', group: 'billing', type: 'string', label: 'Paket default (turun paket)', default: 'gratis' },
  { key: 'billing.oneTrialPerEmail', group: 'billing', type: 'boolean', label: 'Satu uji coba per email', default: 'true' },
  // privacy
  { key: 'privacy.retentionMonths', group: 'privacy', type: 'number', label: 'Masa simpan data kreator (bulan)', default: '24' },
  { key: 'privacy.dataProtectionOfficer', group: 'privacy', type: 'string', label: 'Kontak pelindungan data', default: 'halo@socialz.id' },
  { key: 'privacy.deleteRequestSlaDays', group: 'privacy', type: 'number', label: 'Batas waktu permintaan hapus (hari)', default: '30' },
  { key: 'privacy.auditRetentionDays', group: 'privacy', type: 'number', label: 'Masa simpan log aktivitas (hari)', default: '90' },
  { key: 'privacy.commentTextRetentionDays', group: 'privacy', type: 'number', label: 'Masa simpan teks komentar (hari)', default: '30' },
  { key: 'privacy.backupRetentionDays', group: 'privacy', type: 'number', label: 'Masa simpan cadangan (hari)', hint: 'Harus sama dengan masa PITR di Neon.', default: '30' },
  { key: 'privacy.financialRetentionYears', group: 'privacy', type: 'number', label: 'Masa simpan catatan keuangan (tahun)', default: '10' },
  // app
  { key: 'app.maintenanceMode', group: 'app', type: 'boolean', label: 'Mode perbaikan', default: 'false' },
  { key: 'app.maintenanceMessage', group: 'app', type: 'text', label: 'Pesan mode perbaikan', default: 'Socialz.id sedang dalam perbaikan singkat. Postingan terjadwal tetap aman.' },
  { key: 'app.registrationOpen', group: 'app', type: 'boolean', label: 'Pendaftaran dibuka', default: 'true' },
  { key: 'app.contactRateLimitPerHour', group: 'app', type: 'number', label: 'Batas formulir kontak per jam (per IP)', default: '5' },
  { key: 'display.timezone', group: 'app', type: 'select', label: 'Zona waktu back-office', default: 'Asia/Jakarta', options: TIMEZONE_OPTIONS },
  // channels
  { key: 'channels.publishing.paused', group: 'channels', type: 'boolean', label: 'Jeda semua publikasi', hint: 'Postingan tetap terjadwal dan terbit setelah jeda dicabut.', default: 'false' },
  { key: 'channels.publishing.pausedMessage', group: 'channels', type: 'text', label: 'Pesan saat publikasi dijeda', default: 'Publikasi sedang dijeda sementara karena gangguan dari platform. Postingan Anda tetap terjadwal.' },
  { key: 'channels.autoReply.enabled', group: 'channels', type: 'boolean', label: 'Balas Otomatis aktif', hint: 'Matikan untuk menghentikan semua DM otomatis.', default: 'true' },
  { key: 'channels.autoReply.maxDmsPerAccountPerHour', group: 'channels', type: 'number', label: 'Maks DM per akun per jam', default: '60' },
  { key: 'channels.links.affiliateAllowlist', group: 'channels', type: 'json', label: 'Domain afiliasi yang diizinkan', default: JSON.stringify(AFFILIATE_ALLOWLIST) },
  { key: 'channels.links.freePlanAllowlistOnly', group: 'channels', type: 'boolean', label: 'Paket tanpa "link ke situs mana saja" hanya boleh domain afiliasi', default: 'true' }
]

export const SETTINGS_BY_KEY: Record<string, SettingDef> = Object.fromEntries(SETTINGS_CATALOG.map(def => [def.key, def]))

export function settingDefault(key: string): string {
  return SETTINGS_BY_KEY[key]?.default ?? ''
}

export const MASKED_SECRET = '••••••••'
