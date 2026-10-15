# 17 — Implementation Plan

This build order keeps every step runnable. Each phase ends with:
- lint clean;
- typecheck clean;
- tests green for the touched core modules;
- the flow exercised in the browser.

It merges the platform phases of this blueprint with the product milestones in [`../ROADMAP.md`](../ROADMAP.md). The **Meta review critical path** (Business Verification → App Review → Access Verification) runs in parallel from day one.

## Phase 0 — Decisions (status)

| # | Decision | Status |
|---|---|---|
| 1 | Product name, `{{APP_KEY}}`, site URL | ✅ Socialz.id, `socialz`, `https://socialz.id` |
| 2 | Short link + Etalase domain, media domain, support email | ⏳ **Ask the human** (they own a short domain; the name has not been shared yet) |
| 3 | Product language | ✅ Bahasa Indonesia default, English secondary (i18n) |
| 4 | Workspace roles | ✅ owner / editor / viewer (Pemilik / Editor / Pemantau) |
| 5 | Multi-location (branches) | ✅ Dropped |
| 6 | Plan tiers, limits, features, trial | ✅ `06` §2 (gratis, kreator with 14-day trial, pro seeded inactive) |
| 7 | Payment gateway | ✅ Nexadream Payment Hub. ⏳ Platform API key + issued order prefix from the hub admin |
| 8 | Sign-in methods | ✅ Email + password, plus Google |
| 9 | Mobile app | ✅ None (no `/api/v1`, API keys or push) |
| 10 | Storage / email | ✅ Cloudflare R2; Resend |
| 11 | Stack | ✅ Nuxt 4, Drizzle, Neon, better-auth, Postgres job table + HTTP tick (see `01`, `15`) |
| 12 | Hosting | ✅ Serverless, provider-agnostic (Nitro presets, `19`). ⏳ Reference host for staging: pick at M1 from the `19` §4 tier-1 list |

## Phase 1 — Skeleton (M1)

- Node 24 via fnm (`.nvmrc`).
- Nuxt 4 + Nuxt UI v4 + `@nuxtjs/i18n` + ESLint config; `routeRules` for `/app/**` and `/admin/**`.
- Drizzle + `pg` client (`db`, pooled, small per-instance pool), `drizzle.config.ts` (direct URL, migrations only), `server/core/env.ts` (zod), `server/core/log.ts`.
- `docker/compose.dev.yml` (Postgres 17 + Mailpit for dev email capture through the console email driver).
- Runtime-contract lint rules (`19` §2): no `setInterval` / `process.on` / `node:fs` writes / host SDKs in `server/**`.
- **Portability spike** (½–1 day): build `node-server`, `aws-lambda` and `vercel` presets in CI; on the chosen reference host verify `event.waitUntil`, function `maxDuration`, region pinning, the Cloudflare short-domain rewrite + host guard, and the cron → tick call. Record results in `../PLATFORM-CONSTRAINTS.md`. Optionally try `cloudflare-module` (tier 2).
- `.env.example` (see `01` §5).
- Shared catalog stubs: `status.ts`, `plans.ts`, `permissions.ts`, `workspace-abilities.ts`, `menus.ts`, `settings.ts`, `templates.ts`, `payments.ts`, `channels/*`.
- `server/utils/validate.ts`, `http.ts`; `server/core/crypto.ts`, `rate-limit.ts`, `money.ts`, `timezone.ts`.
- Layouts: `public`, `creator`, `auth-creator`, `admin`, `auth-admin`, `bio`; design tokens + dark mode.
- Job skeleton: `jobs` / `job_schedules` / `system_heartbeat` tables, `enqueue`, `runDue`, `kick`, `runTick`, `/api/internal/tick` (Bearer `CRON_SECRET`), `/api/internal/jobs/run` (HMAC), `scripts/dev-tick.ts`, a `system.noop` queue; `/healthz` (DB ping + tick age).
- CI: lint, typecheck, tests, `db:migrate` (direct URL), seed, deploy to staging, cron entry for the tick.
- `CHANGELOG.md` `## 0.1.0 (Draft)`; root `CLAUDE.md` (exists).

## Phase 2 — Schema & seed (M1)

- Platform schema from `02` + domain schema from `../ARCHITECTURE.md` §7. First migration.
- Idempotent seed: permissions, roles, menus, settings, email + notification templates, plans, gateway row, pages, FAQ, first superadmin, demo creator (dev only).

## Phase 3 — Auth & RBAC (M1)

- `server/core/services/auth/*`: the two better-auth instances + facade.
- Gatekeepers in `server/utils/auth.ts`; `assertAbility` in core.
- Staff: login/logout/profile/menus, forgot/reset, accept-invite.
- Creator: register (`registerCreator`), login (email + Google), email verification, forgot/reset, profile.
- Client: `apiFetch`, `useAuthClient` + two wrappers, global middleware, auth pages, both shells (rail/bottom nav + top bar + user menu).
- Audit log + `recordAudit` for sign-ins.

**M1 done when:** sign up → verification email (Mailpit) → log in (email + Google) → switch id/en; staff can log in to `/admin`; the tick heartbeat is green on staging and a `system.noop` job enqueued from a request runs via kick.

## Phase 4 — Settings, email, notifications (M1–M2)

- `server/core/settings.ts`; `/admin/settings` + test email.
- Resend adapter + brand wrapper; templates catalog + renderer.
- `createNotification`, `notifyStaff`, channels (database + email), bell endpoints for both audiences, `useNotifications`, notification pages.
- `/admin/email-templates` (+ preview), `/admin/notification-templates`.

## Phase 5 — Workspace & onboarding (M2)

- Non-blocking onboarding checklist (`useOnboarding`, server progress endpoint).
- Profile + change password (both audiences); uploads (`handleUpload`).
- Account export + deletion request; `/hapus-akun`; Meta data deletion + deauthorize callbacks; `/legal/data-deletion`.
- Team (invite / revoke / update / accept) is built here but stays behind feature `teamAccess` (off on gratis and kreator).

## Phase 6 — Domain foundation (M2)

Follow `18-domain-layer-guide.md`:
- Token encryption for `social_accounts`.
- Channel adapters for Instagram, Threads and Facebook (connect / refresh / disconnect).
- R2 presigned uploads + `media.process`; the media processor container (`services/media-processor`, `19` §5) deployed to a container host; signed callback + `media.watchdog`.

**M2 done when:** app-role testers connect all three channels, and an iPhone video becomes a valid Reel with no user action.

## Phase 7 — Plans & entitlements (M3)

- `server/core/entitlements.ts`, `requireEntitlement`, `assertWithinLimit`.
- `GET /api/app/entitlements` (+ usage), `useEntitlements`, `<UpgradeDialog>`, `<TrialBanner>`, locked nav entries.
- `/admin/plans` editor.
- Wire gates into domain creates (accounts, rules, Etalase pages, scheduled posts).

## Phase 8 — Publishing (M3)

- Composer (simple by default, "Opsi lanjutan"), calendar, posts list, post detail.
- Publish pipeline (`publish.target` / `poll` / `reconcile`), quota ledger, retries, notifications (`post_failed`, `account_reconnect_needed`, `quota_deferred`).

**M3 done when:** every format publishes automatically, and a 50-post soak plus kill-mid-step tests (lease expiry, concurrent ticks, a missed tick) produce zero duplicate and zero lost posts. **Submit Meta App Review batch 1.**

## Phase 9 — Auto-reply (M4)

- `/api/webhooks/meta` (verify + store + enqueue), `dm.send`, rule templates, activity log, global kill switch setting.

**M4 done when:** a comment produces a DM in under 10 s, and replayed webhooks never double-send. **Submit batch 2.**

## Phase 10 — Links, Etalase, analytics (M5)

- Link vault with paste-a-link autofill (`safe-fetch`).
- Short domain redirect + click logging.
- Etalase editor + public page.
- Simple analytics.

## Phase 11 — Billing & payments (M6)

- `server/core/subscriptions.ts` (state machine, events, `enforceWorkspaceLimits`, `selectActiveAccounts`, cancel, payment lists).
- Payment driver layer + **Nexadream Payment Hub driver**; `checkout.ts`, `payment-apply.ts`, `payment-reconcile.ts`, webhook route.
- `/app/billing` (+ history) with return handling; the blocking "Pilih akun yang tetap aktif" dialog.
- Admin: `/admin/payment-gateways`, `/admin/payments`, `/admin/subscriptions`, `/admin/webhook-events` (+ replay).
- `billing.daily` and `billing.renewal-reminders` schedules.
- **End-to-end test against the real hub** with a low-price plan:
  1. Checkout → pay → webhook → active.
  2. Abandon → expired → no grace while paid-up.
  3. Cancel an unfinished charge.
  4. Reconcile a payment whose webhook you blocked.
  5. Replay a webhook.
- Register the webhook and redirect URLs with the hub admin (`08` §5.6).

## Phase 12 — Back-office completion (M6–M7)

- Dashboard.
- Workspaces list/detail with suspend / reinstate / plan override / delete and a read-only domain drill-down.
- Creator users, staff (invite, edit, deactivate), roles, permissions, menus editor, audit logs.
- Messages, pages (rich text), FAQ.
- Operations screens (failed posts, social account health, link moderation, Meta webhook log).
- Reports.
- Impersonation + banners + `useAdminImpersonation`.

## Phase 13 — Public site (M7–M8)

- Landing (SSR) from `/api/public/landing`; footer from `/api/public/site`.
- CMS pages, contact form, robots + sitemap, SEO meta + JSON-LD.

## Phase 14 — Production readiness (M7–M8)

- `BETTER_AUTH_SECRET` and `SETTINGS_SECRET` set; `CRON_SECRET`, `INTERNAL_SIGNING_SECRET`, `MEDIA_PROCESSOR_SECRET` set; pooled DB URL on the functions, direct URL only in CI; one Neon branch per environment; PITR checked.
- Superadmin password changed; Resend configured and tested; gateway active.
- Production tick every minute **plus a backup pinger**; `job_schedules` seeded; uptime alert on `/healthz`; R2 CORS for the site origin; Cloudflare in front of every domain (rewrite + rate limiting rules); function region pinned to Singapore.
- **Usability test with 5 first-time creators** (target: first scheduled post in under 5 minutes, unaided).
- Closed beta (~20 creators as Meta app testers) → App Live after review + Access Verification.
- Mark the changelog version Released at deploy.

---

## Definition of done (every change)

- [ ] `npm run lint` passes with zero errors.
- [ ] Typecheck passes.
- [ ] Unit/integration tests pass; new core logic in billing, publishing, webhooks or entitlements has tests.
- [ ] `CHANGELOG.md` entry; `package.json` version matches.
- [ ] New pages correct in light **and** dark mode, at phone / tablet / desktop. Phone first.
- [ ] Language check: no English visible to users in the `id` locale (except the closed list); no Bahasa in identifiers, enum values, field names, codes or repo docs.
- [ ] Simplicity check: the newcomer path gained no extra step; advanced options sit behind "Opsi lanjutan"; errors explain the fix.
- [ ] No cross-workspace path: every console query filters by `workspaceId`.
- [ ] No provider vocabulary outside its adapter file (payments, email, storage, auth, **channels**).
- [ ] Only `transitionSubscription()` (or the audited override) writes `subscriptions.status`; every subscription write appends an event.
- [ ] Plan rules read through entitlements, never through a plan slug.
- [ ] New reference data shipped in a migration **and** in the seed.
- [ ] Social tokens and secrets encrypted at rest and never returned raw.

## Pitfalls that already cost real time

| Pitfall | Correct approach |
|---|---|
| Replacing `globalThis.$fetch` in a plugin to add behaviour | `apiFetch` with a lazy client |
| Fulfilling a hub payment from callback content | `trustsWebhookPayload=false` → `getStatus` |
| Matching callbacks by stripping the hub prefix | Store and match `gatewayOrderId` exactly |
| Marking a payment `paid` and activating the plan in separate writes | One transaction |
| Sending emails inside a DB transaction | After commit, outside |
| Treating an abandoned early renewal as a default | `isSubscriptionDue()` before grace |
| A second checkout for the same plan creating a second charge | Reuse the pending one; ask before replacing others |
| Reading the `?status=success` redirect as proof of payment | Re-read the payment's status from the API |
| Deactivating accounts and setting the "choose" flag in separate writes | One transaction |
| A single `AT TIME ZONE` on a UTC `timestamp` column | `(col AT TIME ZONE 'UTC') AT TIME ZONE tz` |
| A raw slug in a badge | Label map + `<StatusBadge>` |
| `USelectMenu` item with `value: ''` | Sentinel constants |
| Hiding paid nav entries on lower plans | Show with a lock; 402 opens the upgrade dialog |
| Shipping new menus/permissions only via `db:seed` in prod | Idempotent migration insert |
| An unknown `{{token}}` in a template | Renders empty, so never send a template whose key variable is empty |
| Root-relative links in emails | Absolutized by the brand wrapper at send time |
| **Blindly retrying `media_publish` after a timeout** | `publish_unknown` → `findRecent()` reconcile (`../ARCHITECTURE.md` §8.3) |
| **Verifying Instagram-Login webhooks with the Facebook app secret** | Use the Instagram app secret for `object: instagram` |
| **`setInterval`, in-memory queues or buffers, `SIGTERM` handlers** | A `jobs` row with `run_at`; state in Postgres (`19` §2) |
| **A floating promise after the response** | `ctx.defer()` / `event.waitUntil()` |
| **Processing "this minute's" work in the tick** | Process everything due; ticks can be missed, doubled or overlap (`15` §1) |
| **A destructive migration in the same release as the code change** | Expand / contract across two releases (`19` §3) |
| **Reading `VERCEL_URL` or another host variable in app code** | `env.ts` values only |
| **Nitro auto-imports inside `server/core`** | Explicit imports only; job handlers, scripts and the media processor share that code |
