# 10 — Platform Settings (how staff configure Socialz.id)

Global configuration that must change **without a deploy** lives in the `app_settings` table. It is described by **one catalog in code**, edited at `/admin/settings`, and read through **one server module**.

## 1. What goes where

| Kind of value | Where | Why |
|---|---|---|
| Infrastructure secrets (DB URLs, `BETTER_AUTH_SECRET`, `SETTINGS_SECRET`, R2 keys, Google OAuth secret, Meta app secrets, Meta webhook verify token) | env | Needed before the DB is reachable, and differ per environment |
| Business configuration (company identity, email sender, billing rules, privacy numbers, app flags, channel kill switches, affiliate allowlist) | `app_settings` | Staff must change it without a release |
| Payment gateway credentials | `payment_gateways` (own table, own screen) | Structured, per provider, exactly one active |
| Plan tiers | `plans` | Structured JSON limits/features |
| Copy of emails / notifications | `email_templates`, `notification_templates` | Editable content |
| Legal and help pages, FAQ | `pages`, `faqs` | CMS |

## 2. The catalog (`shared/utils/settings.ts`)

```ts
export type SettingType = 'string' | 'number' | 'boolean' | 'json' | 'secret' | 'text' | 'select'

export interface SettingDef {
  key: string                 // English, dotted: 'billing.gracePeriodDays'
  group: SettingGroup
  type: SettingType
  label: string               // Bahasa — form label
  hint?: string               // Bahasa — help text
  default: string             // always a string; parsed by the reader
  isSecret?: boolean          // password field, encrypted at rest, masked on read
  options?: { value: string, label: string }[]   // required for 'select'
}

export const SETTING_GROUPS = ['company', 'email', 'billing', 'privacy', 'app', 'channels'] as const

export const SETTING_GROUP_META: Record<SettingGroup, { label: string, description: string, icon: string }> = {
  company:  { label: 'Perusahaan', description: 'Identitas yang tampil di situs, email dan faktur.', icon: 'i-lucide-building' },
  email:    { label: 'Email keluar', description: 'Pengirim email lewat Resend. Kosongkan kunci API untuk mematikan pengiriman email.', icon: 'i-lucide-mail' },
  billing:  { label: 'Penagihan', description: 'Aturan uji coba, masa tenggang, pengingat perpanjangan dan penurunan paket.', icon: 'i-lucide-credit-card' },
  privacy:  { label: 'Privasi & data', description: 'Kebijakan penyimpanan data kreator dan pengunjung.', icon: 'i-lucide-shield-check' },
  app:      { label: 'Aplikasi', description: 'Perilaku aplikasi web.', icon: 'i-lucide-settings-2' },
  channels: { label: 'Kanal & otomasi', description: 'Saklar darurat publikasi dan Balas Otomatis, serta daftar domain afiliasi.', icon: 'i-lucide-radio-tower' }
}

export const SETTINGS_CATALOG: SettingDef[] = [ /* see §3 */ ]
export const SETTINGS_BY_KEY: Record<string, SettingDef>
export function settingDefault(key: string): string
export const MASKED_SECRET = '••••••••'
```

The catalog is used three ways:
1. the **seed** (and migrations) write each key with its default;
2. the **admin form** renders itself from it (group tabs, one field per type);
3. `getSetting()` **falls back** to the catalog default when a row is missing, so a newly added key works before any migration seeds it.

## 3. Full settings list

### company: shown on the site, in emails, in invoices and in the footer

| Key | Type | Default / meaning |
|---|---|---|
| `company.name` | string | `Socialz.id`; also the email brand name |
| `company.tagline` | string | `Jadwalkan konten, kumpulkan link produk, balas komentar otomatis.` (landing hero / meta) |
| `company.legalName` | string | registered PT/CV name, printed on invoices and legal pages |
| `company.email` | string | contact + support address (`halo@socialz.id`, to confirm); contact-form copies go here |
| `company.phone` | string | |
| `company.address` | text | |
| `company.whatsapp` | string | `62xxxx` without `+`; **empty hides** the WhatsApp support button (never a placeholder number, because it becomes a live link) |
| `company.logoUrl` | string | used in the email header |
| `company.instagram`, `company.threads`, `company.tiktok`, `company.youtube` | string | full URLs; empty hides the icon |

### email: outgoing email through Resend or SMTP

| Key | Type | Default |
|---|---|---|
| `email.resendApiKey` | secret | `''`, encrypted |
| `email.fromName` | string | `Socialz.id` |
| `email.fromEmail` | string | `halo@socialz.id` (must be on a domain verified in Resend) |
| `email.replyTo` | string | `''` = same as `company.email` |
| `email.smtpHost` | string | `''` = use `SMTP_HOST` from the env |
| `email.smtpPort` | number | `587` (465 = implicit TLS) |
| `email.smtpUser` | string | `''` |
| `email.smtpPassword` | secret | `''`, encrypted |

Resend wins when its key is set; otherwise SMTP is used when `email.smtpHost` (or, when that is empty, the `SMTP_*` env vars) names a server. With neither, every send is a silent no-op in production. In development, the email service uses a log driver that prints the rendered email to the console (and to Mailpit when it is running), so auth flows can be tested without a key.

### billing: trial, grace, renewal and downgrade rules

| Key | Type | Default | Used by |
|---|---|---|---|
| `billing.gracePeriodDays` | number | `3` | `payment_failed` → `graceEndsAt` |
| `billing.trialReminderDays` | number | `3` | trial reminder window in the billing.daily job |
| `billing.renewalReminderDays` | string | `7,3,1` | billing.renewal-reminders job (comma-separated days before `currentPeriodEnd`) |
| `billing.trialPlanSlug` | string | `kreator` | signup trial plan, `start_trial` |
| `billing.defaultPlanSlug` | string | `gratis` | downgrade target |
| `billing.oneTrialPerEmail` | boolean | `true` | `trial_claims` guard at signup |

### privacy: data protection commitments (some are printed on public pages)

| Key | Type | Default | Used by |
|---|---|---|---|
| `privacy.retentionMonths` | number | `24` | documented retention of creator personal data |
| `privacy.dataProtectionOfficer` | string | support email | contact on the account-deletion page |
| `privacy.deleteRequestSlaDays` | number | `30` | deletion request response + public page |
| `privacy.auditRetentionDays` | number | `90` | audit purge horizon (both audiences); caps every plan's activity-log window |
| `privacy.commentTextRetentionDays` | number | `30` | purge of `dm_events.comment_text` (commenters are third parties) |
| `privacy.backupRetentionDays` | number | `30` | printed on the deletion page; must match the real Neon PITR window |
| `privacy.financialRetentionYears` | number | `10` | payment records kept after deletion (tax law) |

### app: behaviour of the web app

| Key | Type | Default | Used by |
|---|---|---|---|
| `app.maintenanceMode` | boolean | `false` | public settings → console and landing show a maintenance screen; background jobs keep running |
| `app.maintenanceMessage` | text | `Socialz.id sedang dalam perbaikan singkat. Postingan terjadwal tetap aman.` | shown with maintenance mode |
| `app.registrationOpen` | boolean | `true` | `registerOwner` → 503 when false; landing hides the sign-up CTA |
| `app.contactRateLimitPerHour` | number | `5` | contact form, per IP |
| `display.timezone` | select | `Asia/Jakarta` | the clock the back-office renders dates on (options: WIB, WITA, WIT) |

### channels: domain switches and lists

| Key | Type | Default | Used by |
|---|---|---|---|
| `channels.publishing.paused` | boolean | `false` | **global publishing pause.** The `publish.target` handler defers instead of calling Meta (targets stay scheduled and run after unpause). Used during a Meta outage |
| `channels.publishing.pausedMessage` | text | `Publikasi sedang dijeda sementara karena gangguan dari platform. Postingan Anda tetap terjadwal.` | banner in the console while paused |
| `channels.autoReply.enabled` | boolean | `true` | **global auto-reply kill switch.** When off, matched comments are recorded as `skipped` and no DM is sent |
| `channels.autoReply.maxDmsPerAccountPerHour` | number | `60` | per-account cap in the `dm.send` handler (anti-spam) |
| `channels.links.affiliateAllowlist` | json | `["shopee.co.id","s.shopee.co.id","shope.ee","tokopedia.com","tokopedia.link","tiktok.com","vt.tokopedia.com","lazada.co.id","s.lazada.co.id"]` | destination check for short links |
| `channels.links.freePlanAllowlistOnly` | boolean | `true` | when true, workspaces on a plan without the `anyDestination` feature may only shorten allowlisted domains |

Domain settings are added to this same catalog under an existing group or a new one.

## 4. Server module (`server/core/settings.ts`)

This module is the **only door** to `app_settings`. Business code never queries the table.

```ts
getAllSettings(): Promise<Record<string, string>>
  // catalog defaults, overlaid with DB rows; secrets decrypted; 60 s process cache
getSetting(key): Promise<string>
getSettingNumber(key, fallback = 0): Promise<number>   // NaN → fallback
getSettingBool(key): Promise<boolean>                   // 'true' | '1'
getSettingJson<T>(key, fallback: T): Promise<T>         // invalid JSON → fallback (logged)
setSetting(key, value)                                  // upsert; encrypts when def.isSecret; invalidates cache
setSettings(entries)                                    // one transaction + invalidate
invalidateSettingsCache()
claimSettingValue(key, value): Promise<boolean>
  // atomic compare-and-set, usable as a durable "once per day" marker:
  // UPDATE … WHERE value IS DISTINCT FROM $value → rowCount > 0 ⇒ claimed;
  // else INSERT … ON CONFLICT DO NOTHING → inserted ⇒ claimed.
  // Stored in group 'system', not in the catalog, so the admin form never shows it.
```

- Values are always strings in the DB; typed parsing happens in the reader helpers.
- Secrets are stored as `enc:v1:<iv>:<tag>:<ciphertext>` (see `16-cross-cutting.md` §3). `decrypt()` passes plain (legacy or hand-edited) values through unchanged and returns `''` for undecryptable values (after a key rotation), so one bad row cannot break the settings screen.
- Every function instance holds its own 60 s cache. A kill switch therefore takes effect on every instance, including job runs, within a minute. The `publish.target` and `dm.send` handlers read the switch at the start of every job, never once at boot.

## 5. Admin API

```
GET   /api/admin/settings                (settings.read)
  → { catalog: SETTINGS_CATALOG,
      values: { [key]: value } }     // secrets: MASKED_SECRET if stored, '' if not — never the value

PATCH /api/admin/settings               (settings.write)
  body: { values: Record<string, string> }
  for each entry:
    unknown key                         → ignored (a stale form can't fail the save)
    secret && value === MASKED_SECRET   → skipped (= keep stored)
    select && value not in options      → skipped
    json && not valid JSON              → 400 VALIDATION_FAILED { field: key }
  setSettings(updates) → { success, updated: count }
  changes to channels.publishing.paused / channels.autoReply.enabled are also audited as channels.kill_switch

POST  /api/admin/settings/test-email    (settings.write)
  body: { to }
  no Resend key and no SMTP host (production) → 409 "Simpan pengaturan email terlebih dahulu."
  send a short test message; failure → 502 with the driver's error message
```

## 6. Admin UI (`/admin/settings`)

- One tab per `SETTING_GROUPS` entry, with the `SETTING_GROUP_META` label, description and icon.
- Field by type: `string` → input; `text` → textarea; `number` → numeric input; `boolean` → switch; `secret` → password input pre-filled with the mask (an unchanged mask means keep); `select` → select with `options`; `json` → code textarea (the affiliate allowlist gets a friendlier tag input that edits the JSON list).
- A `hint` under each field. One save button per tab (it sends only that group's values; the server rules above make either approach safe).
- The email tab has a "Kirim email uji" button with a recipient field.
- The two kill switches in the channels tab show a confirmation dialog explaining the effect on every creator.
- After saving, the server cache is cleared immediately; other function instances pick the change up within 60 s.

## 7. Public exposure (read-only, never secrets)

| Endpoint | Exposes | Consumer |
|---|---|---|
| `GET /api/public/site` | company identity + social links + WhatsApp; privacy commitments (contact, SLA, audit/backup/financial retention) | every public page footer, `/hapus-akun`, Etalase footer |
| `GET /api/public/landing` | plans (active + public), FAQ, company, `registrationOpen` | landing page (SSR) |
| `GET /api/public/status` | `maintenanceMode`, `maintenanceMessage`, `publishingPaused`, `publishingPausedMessage` | console boot (banner / maintenance screen) |

Never add a secret, an email key, gateway details or the affiliate allowlist logic to these.

## 8. Adding a new setting (checklist)

1. Add a `SettingDef` to `SETTINGS_CATALOG` (English key, Bahasa label/hint, string default, `isSecret` if sensitive).
2. Ship it to existing databases with an idempotent migration insert (`ON CONFLICT ("key") DO NOTHING`, explicit `updated_at`), or rely on the catalog fallback if the default is acceptable until an admin saves.
3. Read it with `getSetting*()`; never cache it yourself.
4. If a public page needs it, add it explicitly to the relevant public endpoint.
