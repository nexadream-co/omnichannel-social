export type TemplateVariable = { token: string, label: string, sample: string }

export interface EmailTemplateDef {
  key: string
  name: string
  description: string
  subject: string
  body: string // inner HTML only; the brand wrapper is added at send time
  variables: TemplateVariable[]
}

export interface NotificationTemplateDef {
  key: string
  name: string
  title: string
  body: string
  actionLabel?: string
  actionUrl?: string
  icon?: string
  level: 'info' | 'success' | 'warning' | 'error'
  variables: TemplateVariable[]
}

const v = (token: string, label: string, sample: string): TemplateVariable => ({ token, label, sample })
const NAME = v('name', 'Nama penerima', 'Rina')
const WORKSPACE = v('workspaceName', 'Nama ruang kerja', 'Toko Rina')
const PLAN = v('planName', 'Nama paket', 'Kreator')
const BILLING_URL = v('billingUrl', 'Tautan halaman langganan', 'https://socialz.id/app/billing')

const button = (token: string, label: string) => `<p><a class="btn" href="{{${token}}}">${label}</a></p>`

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: 'welcome', name: 'Selamat datang', description: 'Setelah pendaftaran.',
    subject: 'Selamat datang di {{appName}}, {{name}}!',
    body: '<p>Hai {{name}},</p><p>Akun <strong>{{workspaceName}}</strong> sudah siap. Mulai dari 4 langkah singkat: hubungkan akun, buat Etalase, tambah produk pertama, lalu jadwalkan postingan pertamamu.</p>' + button('onboardingUrl', 'Mulai sekarang') + '<p>Butuh bantuan? Balas email ini kapan saja.</p>',
    variables: [NAME, WORKSPACE, v('loginUrl', 'Tautan masuk', 'https://socialz.id/app/auth/login'), v('onboardingUrl', 'Tautan panduan', 'https://socialz.id/app')]
  },
  {
    key: 'verify_email', name: 'Verifikasi email', description: 'Pendaftaran dengan email dan kata sandi, atau ganti email.',
    subject: 'Konfirmasi email kamu untuk {{appName}}',
    body: '<p>Hai {{name}},</p><p>Klik tombol di bawah untuk mengonfirmasi email kamu.</p>' + button('verifyUrl', 'Konfirmasi email') + '<p>Tautan berlaku {{expiresInHours}} jam. Kalau kamu tidak mendaftar di {{appName}}, abaikan email ini.</p>',
    variables: [NAME, v('verifyUrl', 'Tautan verifikasi', 'https://socialz.id/app/auth/verify-email?token=abc'), v('expiresInHours', 'Masa berlaku (jam)', '24')]
  },
  {
    key: 'password_reset', name: 'Atur ulang kata sandi', description: 'Lupa kata sandi (kreator dan staf).',
    subject: 'Atur ulang kata sandi {{appName}}',
    body: '<p>Hai {{name}},</p><p>Kami menerima permintaan untuk mengatur ulang kata sandi kamu.</p>' + button('resetUrl', 'Buat kata sandi baru') + '<p>Tautan berlaku {{expiresInHours}} jam. Kalau kamu tidak memintanya, abaikan email ini. Kata sandi lama tetap berlaku.</p>',
    variables: [NAME, v('resetUrl', 'Tautan atur ulang', 'https://socialz.id/app/auth/reset-password?token=abc'), v('expiresInHours', 'Masa berlaku (jam)', '2')]
  },
  {
    key: 'workspace_invitation', name: 'Undangan tim', description: 'Pemilik mengundang anggota tim.',
    subject: '{{inviterName}} mengundang kamu ke {{workspaceName}}',
    body: '<p>Hai {{name}},</p><p>{{inviterName}} mengundang kamu bergabung ke <strong>{{workspaceName}}</strong> sebagai <strong>{{roleName}}</strong>.</p>' + button('inviteUrl', 'Terima undangan') + '<p>Undangan berlaku sampai {{expiresAt}}.</p>',
    variables: [NAME, v('inviterName', 'Nama pengundang', 'Rina'), WORKSPACE, v('roleName', 'Peran', 'Editor'), v('inviteUrl', 'Tautan undangan', 'https://socialz.id/app/auth/accept-invite?token=abc'), v('expiresAt', 'Berlaku sampai', '18 Oktober 2026')]
  },
  {
    key: 'staff_invitation', name: 'Undangan staf', description: 'Undangan ke back-office.',
    subject: 'Undangan staf {{appName}}',
    body: '<p>Hai {{name}},</p><p>{{inviterName}} mengundang kamu sebagai staf {{appName}} dengan peran <strong>{{roleName}}</strong>.</p>' + button('inviteUrl', 'Terima undangan') + '<p>Undangan berlaku sampai {{expiresAt}}.</p>',
    variables: [NAME, v('inviterName', 'Nama pengundang', 'Admin'), v('roleName', 'Peran', 'Support'), v('inviteUrl', 'Tautan undangan', 'https://socialz.id/admin/auth/accept-invite?token=abc'), v('expiresAt', 'Berlaku sampai', '18 Oktober 2026')]
  },
  {
    key: 'trial_started', name: 'Uji coba dimulai', description: 'Uji coba diberikan.',
    subject: 'Uji coba {{planName}} kamu sudah aktif',
    body: '<p>Hai {{name}},</p><p>Selamat! Kamu bisa memakai semua fitur paket <strong>{{planName}}</strong> gratis sampai {{trialEndsAt}}.</p>' + button('billingUrl', 'Lihat paket'),
    variables: [NAME, PLAN, v('trialEndsAt', 'Uji coba berakhir', '29 Oktober 2026'), BILLING_URL]
  },
  {
    key: 'trial_ending_soon', name: 'Uji coba segera berakhir', description: 'Pengingat dari billing.daily.',
    subject: 'Uji coba {{planName}} berakhir {{daysLeft}} hari lagi',
    body: '<p>Hai {{name}},</p><p>Uji coba paket <strong>{{planName}}</strong> untuk {{workspaceName}} berakhir pada {{trialEndsAt}}. Berlangganan agar postingan terjadwal dan Balas Otomatis tetap jalan.</p>' + button('billingUrl', 'Berlangganan sekarang'),
    variables: [NAME, v('daysLeft', 'Sisa hari', '3'), PLAN, WORKSPACE, v('trialEndsAt', 'Uji coba berakhir', '29 Oktober 2026'), BILLING_URL]
  },
  {
    key: 'renewal_reminder', name: 'Pengingat perpanjangan', description: 'Dari billing.renewal-reminders.',
    subject: 'Paket {{planName}} kamu berakhir {{daysLeft}} hari lagi',
    body: '<p>Halo {{name}},</p><p>Paket <strong>{{planName}}</strong> untuk {{workspaceName}} berakhir pada {{periodEnd}}. Perpanjang sekarang ({{amount}}) agar postingan terjadwal tetap jalan. Membayar lebih awal tidak mengurangi sisa waktu kamu.</p>' + button('billingUrl', 'Perpanjang paket'),
    variables: [NAME, v('daysLeft', 'Sisa hari', '7'), PLAN, WORKSPACE, v('periodEnd', 'Akhir periode', '22 Oktober 2026'), v('amount', 'Jumlah', 'Rp49.000'), BILLING_URL]
  },
  {
    key: 'payment_success', name: 'Pembayaran berhasil', description: 'Pembayaran diterima.',
    subject: 'Pembayaran diterima, paket {{planName}} aktif',
    body: '<p>Halo {{name}},</p><p>Terima kasih! Pembayaran {{amount}} untuk paket <strong>{{planName}}</strong> ({{periodLabel}}) sudah kami terima. Paket aktif sampai {{periodEnd}}.</p><p>Nomor pesanan: {{orderId}}</p>' + button('billingUrl', 'Lihat langganan'),
    variables: [NAME, v('amount', 'Jumlah', 'Rp49.000'), PLAN, v('periodLabel', 'Periode', 'bulanan'), v('orderId', 'Nomor pesanan', 'SZ-ABC123'), v('periodEnd', 'Akhir periode', '15 November 2026'), WORKSPACE, BILLING_URL]
  },
  {
    key: 'payment_failed', name: 'Pembayaran gagal', description: 'Pembayaran gagal atau kedaluwarsa saat jatuh tempo.',
    subject: 'Pembayaran paket {{planName}} belum berhasil',
    body: '<p>Halo {{name}},</p><p>Pembayaran {{amount}} untuk paket <strong>{{planName}}</strong> ({{workspaceName}}) belum berhasil. Selesaikan sebelum {{graceEndsAt}} agar paket kamu tidak turun ke Gratis.</p>' + button('billingUrl', 'Bayar sekarang'),
    variables: [NAME, v('amount', 'Jumlah', 'Rp49.000'), PLAN, WORKSPACE, v('graceEndsAt', 'Batas masa tenggang', '18 Oktober 2026'), BILLING_URL]
  },
  {
    key: 'subscription_downgraded', name: 'Paket turun', description: 'Penurunan paket diterapkan.',
    subject: 'Akun {{workspaceName}} sekarang memakai paket {{planName}}',
    body: '<p>Halo {{name}},</p><p>Akun {{workspaceName}} sekarang memakai paket <strong>{{planName}}</strong>. Data kamu tidak dihapus. {{#disabledAccounts}}Akun sosial yang dinonaktifkan sementara: {{disabledAccounts}}. {{/disabledAccounts}}{{#pausedRules}}Aturan Balas Otomatis yang dijeda: {{pausedRules}}. {{/pausedRules}}Semua aktif lagi saat kamu upgrade.</p>' + button('accountSelectionUrl', 'Pilih akun yang tetap aktif'),
    variables: [NAME, WORKSPACE, PLAN, v('accountSelectionUrl', 'Tautan pilih akun', 'https://socialz.id/app/accounts'), v('disabledAccounts', 'Akun yang dinonaktifkan', '@rina.shop'), v('pausedRules', 'Aturan yang dijeda', 'Komentar "mau"')]
  },
  {
    key: 'workspace_suspended', name: 'Akun ditangguhkan', description: 'Staf menangguhkan ruang kerja.',
    subject: 'Akun {{workspaceName}} ditangguhkan',
    body: '<p>Halo {{name}},</p><p>Akun {{workspaceName}} kami tangguhkan sementara.{{#reason}} Alasan: {{reason}}.{{/reason}} Postingan terjadwal tidak akan terbit selama penangguhan.</p>' + button('contactUrl', 'Hubungi kami'),
    variables: [NAME, WORKSPACE, v('reason', 'Alasan', 'Pelanggaran ketentuan'), v('contactUrl', 'Tautan kontak', 'https://socialz.id/kontak')]
  },
  {
    key: 'workspace_deleted', name: 'Akun dihapus', description: 'Ruang kerja dihapus.',
    subject: 'Akun {{workspaceName}} telah dihapus',
    body: '<p>Halo {{name}},</p><p>Akun {{workspaceName}} telah dihapus pada {{deletedAt}}. Terima kasih sudah memakai {{appName}}.</p>',
    variables: [NAME, WORKSPACE, v('deletedAt', 'Tanggal dihapus', '15 Oktober 2026')]
  },
  {
    key: 'contact_enquiry', name: 'Pesan dari formulir kontak', description: 'Formulir kontak → kotak masuk perusahaan.',
    subject: 'Pesan baru: {{subject}}',
    body: '<p><strong>{{name}}</strong> ({{email}}{{#phone}}, {{phone}}{{/phone}}) mengirim pesan:</p><blockquote>{{message}}</blockquote>',
    variables: [NAME, v('email', 'Email', 'rina@example.com'), v('phone', 'Telepon', '6281234567890'), v('subject', 'Subjek', 'Tanya paket'), v('message', 'Pesan', 'Halo, saya mau tanya…')]
  },
  {
    key: 'inactivity_winback', name: 'Ajak kembali', description: 'Pemilik tidak aktif beberapa hari.',
    subject: 'Kangen postinganmu, {{name}}!',
    body: '<p>Hai {{name}},</p><p>Sudah {{days}} hari kamu tidak membuka {{workspaceName}}. Tips: jadwalkan 3 postingan untuk minggu ini dalam 5 menit, lalu biarkan {{appName}} yang bekerja.</p>' + button('appUrl', 'Jadwalkan sekarang'),
    variables: [NAME, WORKSPACE, v('days', 'Jumlah hari', '10'), v('appUrl', 'Tautan aplikasi', 'https://socialz.id/app')]
  },
  {
    key: 'post_failed', name: 'Postingan gagal', description: 'Target postingan berstatus gagal.',
    subject: 'Postingan ke {{platformLabel}} gagal',
    body: '<p>Hai {{name}},</p><p>Postingan ke {{platformLabel}} ({{accountName}}) yang dijadwalkan {{scheduledAt}} gagal terbit: {{reason}}</p>' + button('postUrl', 'Lihat dan perbaiki'),
    variables: [NAME, v('platformLabel', 'Platform', 'Instagram'), v('accountName', 'Akun', '@rina.shop'), v('scheduledAt', 'Jadwal', '15 Oktober 2026, 19.00'), v('reason', 'Alasan', 'Akun Instagram perlu dihubungkan ulang.'), v('postUrl', 'Tautan postingan', 'https://socialz.id/app/posts')]
  },
  {
    key: 'account_reconnect_needed', name: 'Hubungkan ulang akun', description: 'Akun sosial perlu dihubungkan ulang atau akan kedaluwarsa.',
    subject: 'Hubungkan ulang {{platformLabel}} {{accountName}}',
    body: '<p>Hai {{name}},</p><p>Akun {{platformLabel}} <strong>{{accountName}}</strong> perlu dihubungkan ulang{{#expiresAt}} sebelum {{expiresAt}}{{/expiresAt}}. Tanpa ini, postingan terjadwal tidak bisa terbit.</p>' + button('reconnectUrl', 'Hubungkan ulang'),
    variables: [NAME, v('platformLabel', 'Platform', 'Instagram'), v('accountName', 'Akun', '@rina.shop'), v('expiresAt', 'Kedaluwarsa', '20 Oktober 2026'), v('reconnectUrl', 'Tautan', 'https://socialz.id/app/accounts')]
  },
  {
    key: 'autoreply_paused', name: 'Balas Otomatis dijeda', description: 'Aturan dijeda (batas paket, akun nonaktif, saklar darurat).',
    subject: 'Balas Otomatis "{{ruleName}}" dijeda',
    body: '<p>Hai {{name}},</p><p>Aturan Balas Otomatis <strong>{{ruleName}}</strong> untuk {{accountName}} dijeda: {{reason}}</p>' + button('rulesUrl', 'Lihat aturan'),
    variables: [NAME, v('ruleName', 'Nama aturan', 'Komentar "mau"'), v('accountName', 'Akun', '@rina.shop'), v('reason', 'Alasan', 'Batas DM bulan ini sudah tercapai.'), v('rulesUrl', 'Tautan', 'https://socialz.id/app/auto-reply')]
  }
]

export const NOTIFICATION_TEMPLATES: NotificationTemplateDef[] = [
  { key: 'welcome', name: 'Selamat datang', title: 'Selamat datang di {{appName}}', body: 'Ikuti 4 langkah di Beranda untuk postingan terjadwal pertamamu.', actionUrl: '/app', icon: 'i-lucide-party-popper', level: 'success', variables: [] },
  { key: 'trial_started', name: 'Uji coba dimulai', title: 'Uji coba {{planName}} aktif sampai {{trialEndsAt}}', body: 'Semua fitur {{planName}} bisa kamu pakai selama uji coba.', actionUrl: '/app/billing', icon: 'i-lucide-sparkles', level: 'info', variables: [PLAN, v('trialEndsAt', 'Uji coba berakhir', '29 Oktober 2026')] },
  { key: 'trial_ending_soon', name: 'Uji coba segera berakhir', title: 'Uji coba berakhir {{daysLeft}} hari lagi', body: 'Berlangganan agar postingan terjadwal tetap jalan.', actionUrl: '/app/billing', icon: 'i-lucide-hourglass', level: 'warning', variables: [v('daysLeft', 'Sisa hari', '3')] },
  { key: 'renewal_reminder', name: 'Pengingat perpanjangan', title: 'Paket {{planName}} berakhir {{daysLeft}} hari lagi', body: 'Perpanjang agar postingan terjadwal tetap jalan.', actionUrl: '/app/billing', icon: 'i-lucide-calendar-clock', level: 'warning', variables: [PLAN, v('daysLeft', 'Sisa hari', '7')] },
  { key: 'payment_success', name: 'Pembayaran berhasil', title: 'Pembayaran diterima', body: 'Paket {{planName}} aktif sampai {{periodEnd}}.', actionUrl: '/app/billing', icon: 'i-lucide-circle-check', level: 'success', variables: [PLAN, v('periodEnd', 'Akhir periode', '15 November 2026')] },
  { key: 'payment_failed', name: 'Pembayaran gagal', title: 'Pembayaran gagal', body: 'Selesaikan sebelum {{graceEndsAt}} agar paket tidak turun.', actionUrl: '/app/billing', icon: 'i-lucide-circle-x', level: 'error', variables: [v('graceEndsAt', 'Batas masa tenggang', '18 Oktober 2026')] },
  { key: 'subscription_downgraded', name: 'Paket turun', title: 'Akun turun ke paket Gratis', body: 'Pilih akun sosial yang tetap aktif. Data kamu tidak dihapus.', actionUrl: '/app/accounts', icon: 'i-lucide-arrow-down-circle', level: 'warning', variables: [] },
  { key: 'team_invite_accepted', name: 'Anggota tim bergabung', title: '{{memberName}} bergabung ke tim', body: '{{memberName}} sekarang {{roleName}} di {{workspaceName}}.', actionUrl: '/app/team', icon: 'i-lucide-user-plus', level: 'success', variables: [v('memberName', 'Nama anggota', 'Budi'), v('roleName', 'Peran', 'Editor'), WORKSPACE] },
  { key: 'workspace_suspended', name: 'Akun ditangguhkan', title: 'Akun ditangguhkan', body: 'Hubungi kami untuk informasi lebih lanjut.', actionUrl: '/kontak', icon: 'i-lucide-ban', level: 'error', variables: [] },
  { key: 'workspace_deleted', name: 'Akun dihapus', title: 'Akun dihapus', body: 'Terima kasih sudah memakai {{appName}}.', actionUrl: '/kontak', icon: 'i-lucide-trash-2', level: 'error', variables: [] },
  { key: 'post_failed', name: 'Postingan gagal', title: 'Postingan ke {{platformLabel}} gagal', body: '{{reason}}', actionUrl: '{{postUrl}}', icon: 'i-lucide-triangle-alert', level: 'error', variables: [v('platformLabel', 'Platform', 'Instagram'), v('reason', 'Alasan', 'Akun perlu dihubungkan ulang.'), v('postUrl', 'Tautan postingan', '/app/posts')] },
  { key: 'account_reconnect_needed', name: 'Hubungkan ulang akun', title: 'Hubungkan ulang {{platformLabel}} {{accountName}}', body: 'Tanpa ini, postingan terjadwal tidak bisa terbit.', actionUrl: '/app/accounts', icon: 'i-lucide-unplug', level: 'warning', variables: [v('platformLabel', 'Platform', 'Instagram'), v('accountName', 'Akun', '@rina.shop')] },
  { key: 'quota_deferred', name: 'Batas harian tercapai', title: 'Batas harian {{platformLabel}} tercapai', body: '{{count}} postingan dijadwalkan ulang otomatis ke {{nextSlot}}.', actionUrl: '/app/posts', icon: 'i-lucide-clock', level: 'info', variables: [v('platformLabel', 'Platform', 'Instagram'), v('accountName', 'Akun', '@rina.shop'), v('count', 'Jumlah', '2'), v('nextSlot', 'Jadwal berikutnya', 'besok 08.00')] },
  { key: 'autoreply_paused', name: 'Balas Otomatis dijeda', title: 'Balas Otomatis \'{{ruleName}}\' dijeda', body: '{{reason}}', actionUrl: '/app/auto-reply', icon: 'i-lucide-pause-circle', level: 'warning', variables: [v('ruleName', 'Nama aturan', 'Komentar "mau"'), v('reason', 'Alasan', 'Batas DM bulan ini sudah tercapai.')] },
  { key: 'planner_week_open', name: 'Rencana minggu depan', title: 'Minggu depan baru {{count}} dari {{target}} postingan', body: 'Isi hari kosong dari Bank Ide atau siapkan konten untuk momen belanja.', actionLabel: 'Buka Kalender', actionUrl: '{{calendarUrl}}', icon: 'i-lucide-calendar-range', level: 'info', variables: [v('count', 'Terisi', '1'), v('target', 'Target per minggu', '3'), v('calendarUrl', 'Tautan kalender', '/app/calendar')] },
  { key: 'planner_idea_due', name: 'Ide untuk besok', title: 'Besok: {{title}}{{#more}} (+{{more}} ide lain){{/more}}', body: 'Ide ini belum jadi postingan. Jadikan sekarang supaya terbit tepat waktu.', actionLabel: 'Buka Kalender', actionUrl: '{{calendarUrl}}', icon: 'i-lucide-lightbulb', level: 'info', variables: [v('title', 'Ide', 'Review sunscreen setelah 7 hari'), v('more', 'Ide lain', '2'), v('calendarUrl', 'Tautan kalender', '/app/calendar')] },
  { key: 'admin_new_workspace', name: 'Ruang kerja baru (staf)', title: 'Workspace baru: {{workspaceName}}', body: '{{ownerName}} ({{ownerEmail}}) mendaftar dengan paket {{planName}}.', actionUrl: '/admin/workspaces', icon: 'i-lucide-briefcase', level: 'info', variables: [WORKSPACE, v('ownerName', 'Nama pemilik', 'Rina'), v('ownerEmail', 'Email pemilik', 'rina@example.com'), PLAN] },
  { key: 'admin_new_message', name: 'Pesan baru (staf)', title: 'Pesan baru dari {{name}}', body: '{{subject}}', actionUrl: '/admin/messages', icon: 'i-lucide-inbox', level: 'info', variables: [NAME, v('email', 'Email', 'rina@example.com'), v('subject', 'Subjek', 'Tanya paket')] }
]

function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * {{token}} → value (unknown/null → ''). An optional block {{#name}}…{{/name}} renders only when name is non-empty.
 * Values are inserted as-is; HTML callers escape untrusted values first (escapeHtml).
 */
export function renderTemplateString(template: string, variables: Record<string, unknown>): string {
  const withBlocks = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, name: string, inner: string) => toText(variables[name]) ? inner : '')
  return withBlocks.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => toText(variables[name]))
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
