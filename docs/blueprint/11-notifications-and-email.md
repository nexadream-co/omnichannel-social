# 11 — Notifications & Email

## 1. Architecture

```
createNotification(params, tx?)                 server/core/notifications.ts
  ├─ resolve template (DB row if active, else code catalog) and render {{tokens}}
  ├─ write the in-app row (notifications)  ← inside the caller's transaction when tx is given
  └─ dispatchExternal(ctx, channels)       server/core/services/notifications/dispatch.ts
        └─ emailChannel   (enabled when email.resendApiKey or an SMTP host is set, or the dev log driver is active)

sendTemplatedEmail(key, to, vars)              server/core/email.ts — direct email, no bell row
```

- **A channel failure never bubbles into the business operation** that caused it. Every channel is wrapped in try/catch and logged.
- **Email never holds a request or a transaction.** When `createNotification` is called with `tx`, external dispatch is deferred until after commit (the caller passes the result to `dispatchAfterCommit()`). In a request, delivery uses `ctx.defer()` (backed by `event.waitUntil()`); inside a job it is awaited.
- There is **no push channel** (no mobile app). The channels are `database` (bell) and `email`. Adding a channel later (for example WhatsApp) = one file implementing `NotificationChannel` + one entry in `EXTERNAL_CHANNELS`.

```ts
export interface NotificationChannel {
  readonly name: string                       // 'email' | 'whatsapp' (later)
  isEnabled(): Promise<boolean> | boolean     // cheap; unconfigured = silent
  deliver(ctx: NotificationContext): Promise<void>
}
export type ChannelOverrides = Partial<Record<'database' | 'email', boolean>>
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'
```

## 2. `createNotification`

```ts
createNotification({
  audience: 'creator' | 'staff',
  staffUserId?,       // staff recipient
  userId?,            // creator recipient
  workspaceId?,
  // either explicit copy…
  title?, body?, actionUrl?, actionLabel?, icon?, level?,
  // …or a template
  templateKey?, variables?,
  channels?: { database?: false, email?: false }
}, tx?)
```

- Explicit fields override template fields.
- No title and no known template → throws (programming error).
- `channels.database === false` skips the bell row (email-only sends).
- The recipient's email and name are looked up from `userId` / `staffUserId` for the email channel.
- **Dedupe for noisy domain events:** `post_failed`, `account_reconnect_needed` and `quota_deferred` accept a `dedupeKey` (e.g. `post_failed:<postTargetId>`, `account_reconnect_needed:<socialAccountId>:<yyyy-mm-dd>`). If an unread notification with the same template and dedupe key exists for the recipient, no new row is written and no email is sent. This stops one broken account from flooding a creator's inbox.

`notifyWorkspaceOwners(workspaceId, params)`: sends to the active `owner` of the workspace (and, for operational templates such as `post_failed`, also to active `editor` members). Billing templates go to owners only.

`notifyStaff(permissionKey, params)`: sends to **every active staff member whose role holds that permission** (e.g. `workspaces.read` for "new workspace", `messages.read` for "new contact message", `workspaces.write` for "deletion request").

`listNotifications(ctx, { search, unreadOnly, dateFrom, dateTo, page, limit })`: one implementation behind the creator bell and the `/app/notifications` page. `unreadCount` counts **everything addressed to the user**, never just the filtered page. Scope: `audience='creator'`, `userId`, `workspaceId`.

Endpoints (each audience):

```
GET  /api/app/notifications            ?search&unreadOnly&dateFrom&dateTo&page&limit
POST /api/app/notifications/:id/read
POST /api/app/notifications/read-all
GET  /api/admin/notifications          (+ the same read endpoints)
```

The client `useNotifications()` is a `useState` composable shared by the bell dropdown and the notifications page (one fetch, one badge). It refetches on window focus and every 60 s while the tab is visible.

## 3. Templates

Two tables, seeded from one code catalog (`shared/utils/templates.ts`): `EMAIL_TEMPLATES` and `NOTIFICATION_TEMPLATES`. Keys are English; every rendered string is in Bahasa Indonesia. Staff edit copy at `/admin/email-templates` and `/admin/notification-templates`; keys are not created in the UI (code references them).

```ts
export type TemplateVariable = { token: string, label: string, sample: string }

export interface EmailTemplateDef {
  key: string; name: string; description: string
  subject: string; body: string            // inner HTML only; the brand wrapper is added at send time
  variables: TemplateVariable[]
}
export interface NotificationTemplateDef {
  key: string; name: string; title: string; body: string
  actionLabel?: string; actionUrl?: string; icon?: string
  level: 'info' | 'success' | 'warning' | 'error'
  variables: TemplateVariable[]
}

/** {{token}} → value (unknown/null → ''). An optional block {{#name}}…{{/name}} renders only when name is non-empty. */
export function renderTemplateString(template: string, variables: Record<string, unknown>): string
```

Common variables injected into every email: `appName` (= `company.name`), `siteUrl`, `supportEmail` (= `company.email`), `whatsappUrl` (empty when `company.whatsapp` is empty).

Resolution rules (they differ on purpose):

| | DB row active | DB row inactive | No DB row |
|---|---|---|---|
| Email (`renderEmailTemplate`) | DB row | **not sent** (staff switched it off) | code catalog |
| Notification (`resolveTemplate`) | DB row | code catalog | code catalog |

When the email channel mirrors a notification that has a `templateKey`, it prefers the **email template with the same key** (richer copy). Otherwise it sends the notification title/body with a CTA button to `actionUrl`.

**Auth emails** (verify email, reset password, staff invitation) are triggered by better-auth callbacks (`sendVerificationEmail`, `sendResetPassword`) that call `sendTemplatedEmail` with these templates. better-auth never sends email by itself.

### 3.1 Email templates

| Key | When | Variables |
|---|---|---|
| `welcome` | after signup | `name`, `workspaceName`, `loginUrl`, `onboardingUrl` |
| `verify_email` | signup with email + password, email change | `name`, `verifyUrl`, `expiresInHours` |
| `password_reset` | forgot password (both audiences) | `name`, `resetUrl`, `expiresInHours` |
| `workspace_invitation` | owner invites a team member | `name`, `inviterName`, `workspaceName`, `roleName`, `inviteUrl`, `expiresAt` |
| `staff_invitation` | staff invite | `name`, `inviterName`, `roleName`, `inviteUrl`, `expiresAt` |
| `trial_started` | trial granted | `name`, `planName`, `trialEndsAt`, `billingUrl` |
| `trial_ending_soon` | billing.daily reminder | `name`, `daysLeft`, `planName`, `workspaceName`, `trialEndsAt`, `billingUrl` |
| `renewal_reminder` | billing.renewal-reminders job | `name`, `daysLeft`, `planName`, `workspaceName`, `periodEnd`, `amount`, `billingUrl` |
| `payment_success` | payment paid | `name`, `amount`, `planName`, `periodLabel`, `orderId`, `periodEnd`, `workspaceName`, `billingUrl` |
| `payment_failed` | failed/expired while due | `name`, `amount`, `planName`, `workspaceName`, `graceEndsAt`, `billingUrl` |
| `subscription_downgraded` | downgrade enforced | `name`, `workspaceName`, `planName` (new plan), `accountSelectionUrl`, `disabledAccounts`, `pausedRules` |
| `workspace_suspended` | staff suspend | `name`, `workspaceName`, `reason`, `contactUrl` |
| `workspace_deleted` | soft delete | `name`, `workspaceName`, `deletedAt` |
| `contact_enquiry` | contact form → company inbox | `name`, `email`, `phone`, `subject`, `message` |
| `inactivity_winback` | owner inactive N days | `name`, `workspaceName`, `days`, `appUrl` |
| `post_failed` | a post target reached `failed` | `name`, `platformLabel`, `accountName`, `scheduledAt`, `reason`, `postUrl` |
| `account_reconnect_needed` | a social account went `needs_reauth`, or its token expires within 7 days | `name`, `platformLabel`, `accountName`, `expiresAt`, `reconnectUrl` |
| `autoreply_paused` | a rule was paused (plan limit, account disabled, kill switch) | `name`, `ruleName`, `accountName`, `reason`, `rulesUrl` |

### 3.2 Notification templates (bell)

| Key | Title (example) | Action | Level |
|---|---|---|---|
| `welcome` | "Selamat datang di {{appName}}" | `/app` | success |
| `trial_started` | "Uji coba {{planName}} aktif sampai {{trialEndsAt}}" | `/app/billing` | info |
| `trial_ending_soon` | "Uji coba berakhir {{daysLeft}} hari lagi" | `/app/billing` | warning |
| `renewal_reminder` | "Paket {{planName}} berakhir {{daysLeft}} hari lagi" — "Perpanjang agar postingan terjadwal tetap jalan." | `/app/billing` | warning |
| `payment_success` | "Pembayaran diterima" — "Paket {{planName}} aktif sampai {{periodEnd}}." | `/app/billing` | success |
| `payment_failed` | "Pembayaran gagal" — "Selesaikan sebelum {{graceEndsAt}} agar paket tidak turun." | `/app/billing` | error |
| `subscription_downgraded` | "Akun turun ke paket Gratis" — "Pilih akun sosial yang tetap aktif. Data Anda tidak dihapus." | `/app/accounts` | warning |
| `team_invite_accepted` | "{{memberName}} bergabung ke tim" | `/app/team` | success |
| `workspace_suspended` | "Akun ditangguhkan" | `/kontak` | error |
| `workspace_deleted` | "Akun dihapus" | `/kontak` | error |
| `post_failed` | "Postingan ke {{platformLabel}} gagal" — "{{reason}}" | `{{postUrl}}` | error |
| `account_reconnect_needed` | "Hubungkan ulang {{platformLabel}} {{accountName}}" — "Tanpa ini, postingan terjadwal tidak bisa terbit." | `/app/accounts` | warning |
| `quota_deferred` | "Batas harian {{platformLabel}} tercapai" — "{{count}} postingan dijadwalkan ulang otomatis ke {{nextSlot}}." | `/app/posts` | info |
| `autoreply_paused` | "Balas Otomatis '{{ruleName}}' dijeda" — "{{reason}}" | `/app/auto-reply` | warning |
| `admin_new_workspace` | "Workspace baru: {{workspaceName}}" (staff) | `/admin/workspaces` | info |
| `admin_new_message` | "Pesan baru dari {{name}}" (staff) | `/admin/messages` | info |

Variables for notification-only templates:

| Key | Variables |
|---|---|
| `team_invite_accepted` | `memberName`, `roleName`, `workspaceName` |
| `quota_deferred` | `platformLabel`, `accountName`, `count`, `nextSlot` |
| `admin_new_workspace` | `workspaceName`, `ownerName`, `ownerEmail`, `planName` |
| `admin_new_message` | `name`, `email`, `subject` |

**Rule:** a template whose copy depends on a variable (e.g. `{{graceEndsAt}}`, `{{reason}}`) must only be sent when that variable has a value. Sending `payment_failed` with an empty deadline to a paid-up customer is a real past bug in the system this blueprint came from. `post_failed.reason` always comes from the channel error label map (`shared/utils/status.ts`), never from Meta's raw error text.

## 4. Email (`server/core/email.ts` + `server/core/services/email/`)

- `server/core/services/email/resend.ts` is **the only file that knows Resend exists.** It calls `POST https://api.resend.com/emails` with plain `fetch` (`Authorization: Bearer <email.resendApiKey>`, body `{ from, to, subject, html, text, reply_to }`), with a 10 s timeout. No SDK.
- `server/core/services/email/smtp.ts` is **the only file that knows nodemailer exists.** It is used when `email.resendApiKey` is empty and an SMTP host is configured: the `email.smtp*` settings when `email.smtpHost` is set, otherwise `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` from the env. The block comes whole from one source (`smtpConfigFrom`). Port 465 means implicit TLS; any other port (587 by default) upgrades with STARTTLS when offered. One connection per send, no pool, 10 s connect and 15 s socket timeouts. It needs raw TCP, so it works on Node hosts (Vercel, VPS, Cloud Run, Lambda) but **not on Cloudflare Workers**; Resend stays the portable driver.
- A third driver, `log.ts`, prints the rendered email (and posts it to Mailpit's HTTP API when `MAILPIT_URL` is set) and is used automatically outside production when neither Resend nor SMTP is configured.
- Driver order: Resend key → SMTP host → dev log driver → none. None configured in production → every send is a **silent no-op** returning `{ sent: false, skipped: 'not-configured' }`. It must never throw.
- `from` = `"<email.fromName>" <email.fromEmail>`; `reply_to` = `email.replyTo` or `company.email`.
- Every HTML body is wrapped by `wrapEmailHtml(inner, { appName, siteUrl, supportEmail, companyName, logoUrl, whatsappUrl })` (`shared/utils/email-brand.ts`): table layout, logo (`company.logoUrl` or a bundled default, absolute URL), brand-coloured CTA class, footer with company name, support email, WhatsApp link when set, and the year. It also **absolutizes root-relative hrefs** (`href="/app/…"` → `https://socialz.id/app/…`) because mail clients have no base URL; `//host`, `mailto:`, `#` and absolute links are left alone.
- A plain-text alternative is generated (`htmlToText`).
- Send failures are logged and returned (`{ sent: false, error }`), never thrown. Email must never break the request or job that triggered it.
- Seam: delivery is inline in v1. An `email.send` job queue (`15`) can be inserted behind `sendEmail` without touching callers (useful if Resend rate limits become a problem).

```ts
sendEmail({ to, subject, html, text?, replyTo? }): Promise<SendEmailResult>
renderEmailTemplate(key, variables): Promise<{ subject, html } | null>
sendTemplatedEmail(key, to, variables): Promise<SendEmailResult>
isEmailConfigured(): Promise<boolean>
```

Admin tools: test email (`POST /api/admin/settings/test-email`) and the template editor with live preview (`POST /api/admin/email-templates/preview { subject, body, variables }` → rendered subject + wrapped HTML).

## 5. Inactivity reminders (engagement)

The `engagement.inactivity` job runs daily at 07:00 WIB (see `15`):

- Owners (only owners, of active workspaces) whose last activity (`lastSeenAt`, else `lastLoginAt`) fell on the local day exactly `INACTIVITY_EMAIL_DAYS = 10` days ago get the `inactivity_winback` email. There is no push nudge (no mobile app).
- Owners who still have **posts scheduled in the future** are skipped: their account is working for them even if they don't log in.
- **Stateless per person:** nothing records who was reminded (a missed day is simply missed). The schedule slot claim (`15` §1.2) runs it once per day; `claimSettingValue('cron.inactivityRanOn', todayKey)` additionally makes a duplicate run (for example a manual "Jalankan sekarang") a no-op.
