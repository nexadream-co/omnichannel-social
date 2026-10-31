# 09 — Platform Back-office (`/admin`)

The back-office is how Socialz.id staff run the platform: workspaces, subscriptions, plans, payments, gateway credentials, publishing operations, social account health, link moderation, content, templates, staff accounts, roles, menus and global settings, **all without a redeploy**.

- SPA (`ssr: false`), layout `admin.vue` → `<AdminShell>`; auth pages use `auth-admin.vue`.
- Session: the **staff** better-auth instance (cookie prefix `socialz_staff`, basePath `/api/admin/auth`). No public sign-up; staff are invited.
- UI language: Bahasa Indonesia (staff are local). A **closed** list of English labels is allowed where the local word reads unnaturally: "Payment gateway", "Payment callback", "Meta webhook", "Workspace", "Support", "Impersonate", "Trial", and the "Test environment" badge. Adding to the list is a product decision.
- Desktop-first. Not installable as a PWA.

## 1. Shell

- **Left rail** (collapsible, state in a cookie): fixed items at the top (Beranda → `/admin/dashboard`, Laporan → `/admin/reports` if `reports.read`), then the **DB-driven menu tree** from `GET /api/admin/menus/tree` (skeleton while loading), app version in the footer.
- **Top bar:** breadcrumb (from a route catalog), greeting on the dashboard, a "Test environment" badge when `appEnv !== 'production'`, `<NotificationMenu>` (bell), `<UserMenu>` (profile, change password, dark mode, sign out).
- **Global banners:** `<AdminImpersonationBanner>` while impersonating another staff member; a red banner when `channels.publishing.paused` or `channels.autoReply.enabled = false` is in force, so nobody forgets a kill switch is on.
- **Page body:** `<CommandBar>` with title + primary actions; dense, server-paginated tables; `<FormSlideover>` (right panel) for create/edit; `UModal` only for confirmations and read-only details.

## 2. Menu tree (`shared/utils/menus.ts` → `MENU_TREE`)

```
Bisnis (business)
  Workspace              /admin/workspaces          workspaces.read
  Langganan              /admin/subscriptions       subscriptions.read
  Paket                  /admin/plans               plans.read
  Pembayaran             /admin/payments            payments.read
  Payment gateway        /admin/payment-gateways    payments.write
  Payment callback       /admin/webhook-events      payments.read
Operasional (operations)
  Postingan gagal        /admin/publish-failures    publishing.read
  Kesehatan akun sosial  /admin/social-accounts     channels.read
  Moderasi link & Etalase /admin/links              links.read
  Meta webhook           /admin/meta-webhooks       channels.read
Konten (content)
  Halaman                /admin/pages               pages.read
  FAQ                    /admin/faq                 faq.read
  Pesan masuk            /admin/messages            messages.read
  Templat email          /admin/email-templates     email-templates.read
  Templat notifikasi     /admin/notification-templates notification-templates.read
Akses (access)
  Pengguna (group)
    Staf                 /admin/staff               staff.read
    Pengguna kreator     /admin/users               workspaces.read
  Peran                  /admin/roles               roles.read
  Hak akses              /admin/permissions         permissions.read
  Menu                   /admin/menus               menus.read
Sistem (system)
  Pengaturan             /admin/settings            settings.read
  Log aktivitas          /admin/audit-logs          settings.read
  Antrean pekerjaan      /admin/system/jobs         settings.read
  Log error              /admin/system/logs         logs.read
```

## 3. Screen by screen

Each row lists the page, its endpoints, its permission, and what it does with the rules behind it.

### 3.1 Overview

| Page | Endpoints | Permission | Content |
|---|---|---|---|
| `/admin/dashboard` | `GET /api/admin/dashboard` | `dashboard.read` | Workspaces total/active/suspended/new this month; subscriptions by status; revenue this month (sum of `paid` payments by `paidAt`); unread contact messages; 6 newest workspaces (with plan/status); 6 latest payments (30 d); new creators per month (last 6 months). **Platform health tiles:** posts published / failed in the last 24 h (aggregate count and success rate per platform), social accounts in `needs_reauth`, auto-reply DMs sent today, Meta webhook backlog (unprocessed rows), last tick age, job backlog per queue, dead jobs. Never shows a creator's post content. |
| `/admin/reports` | `GET /api/admin/reports/summary?period=day\|week\|month&limit≤60` | `reports.read` | Platform-wide, aggregate only, one clock (Asia/Jakarta). Per bucket: revenue, payment count, new paid, renewals, churned, trials lapsed, signups, onboarded (checklist finished), active workspaces, and domain totals (posts published, auto-reply DMs sent, short link clicks). Totals + average payment; revenue by plan and by period; **current book**: MRR (monthly at price, yearly ÷ 12), paying, trialing, past due, by plan; conversion of signups in window; `historySince` (the day `subscription_events` began; earlier churn is "unknown", not zero). Usage section from `usage_daily` (device-days, labelled as such). |
| `/admin/notifications` | `GET /api/admin/notifications`, `POST …/:id/read`, `POST …/read-all` | any staff | The staff member's own bell (new workspace, new contact message, deletion request). |

### 3.2 Business (Bisnis)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/workspaces` | `GET /api/admin/workspaces?page&limit&search&status&planSlug&subscriptionStatus&deleteRequested&sort&order` | `workspaces.read` | Excludes soft-deleted. Search by name, owner email or phone. Shows plan, subscription status, trial/period end, connected social account count, deletion-request flag. |
| `/admin/workspaces/:id` | `GET /api/admin/workspaces/:id` | `workspaces.read` | Workspace profile, owner, subscription + plan, **effective entitlements with usage**, members (last login, active), last 10 payments, deletion request (who/when/reason from the audit row). **Read-only support drill-down:** connected social accounts (platform, username, status, token expiry), the last 20 post targets with status and last error code, link count, Etalase handle and published state, auto-reply rule count. |
| ″ actions | `POST …/:id/suspend {reason}` | `workspaces.write` | See `05` §7. A suspended workspace's scheduled posts are not published (the publish job checks status) and its short links and Etalase still resolve. |
| | `POST …/:id/reinstate` | `workspaces.write` | |
| | `POST …/:id/plan {planSlug, period, status, currentPeriodEnd?, note?}` | `subscriptions.write` | Audited override; writes `subscription_events('admin_override')`, then `enforceWorkspaceLimits`. |
| | `DELETE …/:id` | superadmin | Soft delete + owner notified. |
| | `POST …/:id/impersonate` | superadmin (not impersonating) | Opens `/app` as the owner (creator session with `impersonatedBy`); banner; billing read-only; publishing actions allowed but audited. |
| `/admin/subscriptions` | `GET /api/admin/subscriptions` | `subscriptions.read` | All subscriptions, filters by status/plan, trial end, period end, grace end. |
| `/admin/plans` | `GET/POST /api/admin/plans`, `PATCH/DELETE /api/admin/plans/:id` | `plans.read` / `plans.write` | Plan editor: name, slug, description, monthly/yearly price, trial days, active, public, order, one field per limit key (with an unlimited toggle) and one switch per feature key. See `06` §7. |
| `/admin/payments` | `GET /api/admin/payments` | `payments.read` | Every subscription payment: order id, gateway order id, workspace, plan, period, amount, status (+ raw status), type, paid at, created. Filters + search. |
| `/admin/payment-gateways` | `GET /api/admin/payment-gateways`, `PATCH …/:id` | read: `payments.read`; edit: `payments.write` | One card per seeded gateway; form fields from the provider catalog; secrets masked; activation validates required fields; exactly one active. See `08` §9. |
| `/admin/webhook-events` | `GET /api/admin/webhook-events`, `POST …/:id/replay` | `payments.read` / `payments.write` | Payment callback log: provider, gateway order id, provider's status word, processed at, error, replay count, payload viewer. Replay button. |

### 3.3 Operations (Operasional)

These screens exist because Socialz.id depends on Meta APIs that fail in ways creators cannot fix alone. They show **operational metadata**, never the content of a creator's private DMs.

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/publish-failures` | `GET /api/admin/publish-failures?platform&errorKind&range`, `POST /api/admin/publish-failures/:targetId/retry` | `publishing.read` / `publishing.write` | `post_targets` in `failed` / `publish_unknown` / `quota_deferred` / `needs_reauth`, newest first: workspace, platform, format, scheduled time, attempt count, last error code + subcode + fbtrace id, the latest `publish_attempts` rows. Grouped counts by error kind on top (helps spot a Meta outage or a Graph version problem). **Retry** re-enqueues the target from its stored step (never a blind republish; `publish_unknown` runs reconciliation first). Audited `publishing.retry`. |
| `/admin/social-accounts` | `GET /api/admin/social-accounts?platform&status&expiringWithinDays`, `POST …/:id/refresh` | `channels.read` / `channels.write` | Every connected account across workspaces: platform, username, workspace, status, token expiry, last successful publish, scopes. Filters: `needs_reauth`, expiring within N days. **Refresh** enqueues `token.refresh.one` for that account. Tokens are never shown (not even masked). Also shows the global kill switches with toggles: "Balas Otomatis aktif" (`channels.autoReply.enabled`) and "Jeda semua publikasi" (`channels.publishing.paused` + message); each toggle asks for confirmation and is audited `channels.kill_switch`. |
| `/admin/links` | `GET /api/admin/links?search&flagged&range`, `POST /api/admin/links/:shortLinkId/disable {reason}`, `POST …/:id/enable`, `GET /api/admin/bio-pages?search`, `POST /api/admin/bio-pages/:id/unpublish {reason}` | `links.read` / `links.write` | Abuse handling. Search short links by slug, destination domain or workspace; show click totals (7 d), destination domain, whether it is on the affiliate allowlist. **Disable** a short link (redirect then serves the "link tidak tersedia" page) or **unpublish** an Etalase handle. Both notify the owner with the reason and are audited (`link.disable`, `bio.unpublish`). Edit the affiliate allowlist in `/admin/settings` (channels group). |
| `/admin/meta-webhooks` | `GET /api/admin/meta-webhooks?topic&processed&error`, `POST …/:id/replay` | `channels.read` / `channels.write` | The domain `webhook_events` inbox (provider `meta`): topic, dedupe key, received at, processed at, attempts, error, a redacted payload viewer (comment text is shown only to superadmin). **Replay** re-enqueues processing; the `dm_events` unique key keeps a replay from sending a second DM. |

### 3.4 Content (Konten)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/pages` | `GET/POST /api/admin/pages`, `GET/PATCH/DELETE …/:id` | `pages.*` | CMS pages (privacy, terms, payment policy, help center, any custom). Fields: slug (unique, 409), title, rich-text content (TipTap, lazy, HTML sanitized on save), excerpt, meta title/description, published. Public at `/page/:slug`; `/privacy` and `/terms` render the rows with those slugs. These pages are required by Meta App Review, so the published state of `privacy` and `terms` cannot be turned off (409). |
| `/admin/faq` | `GET/POST /api/admin/faq`, `PATCH/DELETE …/:id` | `faq.*` | Question, answer, category, order, active. The landing page reads active rows in order. |
| `/admin/messages` | `GET /api/admin/messages`, `PATCH …/:id {status}`, `DELETE …/:id` | `messages.*` | Contact-form inbox. Status `new → read → replied → archived`; `handledAt` set on the first non-new status, cleared when set back to `new`. |
| `/admin/email-templates` | `GET /api/admin/email-templates`, `PATCH …/:id`, `POST …/preview` | `email-templates.*` | Edit subject + HTML body with `{{token}}` placeholders; variable palette from the template's `variables` (label + sample); **live preview** renders tokens with samples inside the brand wrapper; toggle active (inactive → the email is skipped, the code catalog is *not* used as a fallback). Keys are fixed (created by seed/migration), not creatable. |
| `/admin/notification-templates` | `GET …`, `PATCH …/:id` | `notification-templates.*` | Edit title, body, action label/URL, icon, level and active for in-app notifications. |

### 3.5 Access (Akses)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/staff` ("Staf") | `GET/POST /api/admin/staff`, `PATCH/DELETE …/:id`, `POST …/:id/impersonate` | `staff.*` | Staff list. **Invite** (email, name, role) → `staff_invitation` email, a 7-day link to `/admin/auth/accept-invite` where they set name + password. Edit name/phone/role/active. You cannot deactivate yourself or change your own role (409). Only a superadmin may grant the superadmin role or delete a superadmin (403). Delete = deactivate (`isActive=false`, all their staff sessions revoked). Role change audited `role.update`. Impersonate another staff member (superadmin only; never another superadmin, never yourself). |
| `/admin/users` ("Pengguna kreator") | `GET /api/admin/users`, `POST …/:id/impersonate {workspaceId?}`, `POST …/:id/revoke-sessions` | `workspaces.read` (impersonate/revoke: superadmin) | Every creator login across all workspaces: name, email, phone, workspace(s), role, sign-in methods (password / Google), email verified, last login/seen, active. Impersonate a specific login. **Revoke sessions** signs the user out everywhere (support for a compromised account). |
| `/admin/roles` | `GET/POST /api/admin/roles`, `PATCH/DELETE …/:id` | `roles.*` | Role name, slug, description, permission checklist grouped by `PERMISSION_GROUP_LABELS` with `Lihat`/`Ubah` columns. Rules in `04` §1.2. |
| `/admin/permissions` | `GET /api/admin/permissions` | `permissions.read` | Read-only catalog of permission keys, groups, descriptions, and which roles hold each. (Keys are code; they are not created here.) |
| `/admin/menus` | `GET/POST /api/admin/menus`, `PATCH/DELETE …/:id`, `POST …/reorder` | `menus.*` | Edit the sidebar tree: label, slug, path, icon, permission key, parent, order, active. Drag to reorder (one transaction). Must render all three levels. Delete is refused while an item has children. |

### 3.6 System (Sistem)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/settings` | `GET /api/admin/settings`, `PATCH /api/admin/settings {values}`, `POST /api/admin/settings/test-email {to}` | `settings.read` / `settings.write` | The whole platform configuration, as grouped tabs rendered from the settings catalog (company, email, billing, privacy, app, channels). See `10-platform-settings.md`. |
| `/admin/audit-logs` | `GET /api/admin/audit-logs?search&action&audience&range\|dateFrom&dateTo` | `settings.read` | Every audit row (both audiences): time, actor (+ "via impersonate" when `impersonatorId` is set), workspace, action label (from `AUDIT_ACTION_LABELS`), target, metadata, IP, user agent. Range presets resolved server-side on the platform clock. |
| `/admin/system/jobs` | `GET /api/admin/system/jobs`, `POST /api/admin/system/jobs/:name/run` | `settings.read` / `settings.write` | Job overview from the `jobs` table: backlog and oldest due job per queue, dead jobs with their error and a "Coba lagi" retry, last tick age and summary, each schedule's `last_slot`, media processor last callback. "Jalankan sekarang" enqueues and kicks a one-off run of a platform schedule (idempotent by design, see `15` §5); audit `system.job_run` / `system.job_retry`. |
| `/admin/system/logs` | `GET /api/admin/system/logs?user&search&level&range` | `logs.read` (Superadmin and Admin; never Support) | Warn/error log lines from `app_logs`, newest first: time, level, event (`msg`) with its one-line reason, the creator (email + workspace) or staff member who hit it. `user` matches a creator email (partial) or an exact user / workspace id; `search` matches the event, the path and the stored fields. Detail dialog: path, request id, stored fields, and "Semua log pengguna ini". `/admin/users` rows link here pre-filtered. Lines older than 30 days are deleted by `maintenance.purge`. |

### 3.7 Account chrome (every staff member)

| Page | Endpoints |
|---|---|
| `/admin/profile` | `GET /api/admin/me`, `PATCH /api/admin/me` (name, phone, avatar), `POST /api/admin/uploads` (avatar, ≤ 50 KB) |
| `/admin/change-password` | `POST /api/admin/auth/change-password` (a separate page from profile on purpose) |
| `/admin/auth/*` | better-auth staff endpoints (`sign-in/email`, `sign-out`, `forget-password`, `reset-password`) + `POST /api/admin/staff-invitations/accept` + `POST /api/admin/impersonation/stop` |

## 4. How an admin typically operates the platform

1. **First deploy:** sign in as the seeded superadmin → change password → `/admin/settings`: company identity, email (Resend key, then "Kirim email uji"), billing rules, privacy numbers, app flags, channels (affiliate allowlist) → `/admin/payment-gateways`: enter the hub API key, base URL and order prefix → activate → `/admin/plans`: confirm real prices/limits/features → `/admin/pages` + `/admin/faq`: legal and help content (privacy and terms must be live before Meta App Review) → `/admin/email-templates`: review copy → `/admin/staff`: invite staff with `admin` / `support` roles.
2. **Daily:** dashboard (platform health tiles) → publish failures (a spike usually means a Meta outage or an expired permission) → social accounts needing reconnection → messages inbox → payments + webhook events (any errors? replay) → workspaces with deletion requests.
3. **Support case:** find the workspace (`/admin/workspaces`) or the login (`/admin/users`) → read the detail and drill-down → impersonate if needed (billing read-only) → stop impersonating.
4. **Commercial change:** edit a plan (takes effect within the 60 s entitlement cache), or override one workspace's plan with a note.
5. **Incident:** Meta outage → `channels.publishing.paused` on with a message (scheduled targets wait in `quota_deferred`-style deferral instead of failing); auto-reply flagged as spam → `channels.autoReply.enabled` off; site problem → `app.maintenanceMode` with a message; abuse wave → close registration via `app.registrationOpen`.

## 5. List endpoint shape (admin)

Admin list endpoints return `{ items, meta: { page, limit, total, pageCount } }` and accept the shared `parseListQuery` params (`page`, `limit ≤ 100`, `search`, `sort`, `order`, `dateFrom`, `dateTo`, `isActive`) plus their own filters. Tables are always server-paginated; the count shown is `meta.total`.
