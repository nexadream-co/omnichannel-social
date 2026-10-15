# CLAUDE.md — Socialz.id

Socialz.id is a multi-tenant SaaS for **Indonesian affiliate creators**, beginners included. Creators schedule posts to Instagram, Threads and Facebook Pages, keep affiliate product links as tracked short links, run a link-in-bio storefront (**Etalase**), and auto-DM product links when someone comments a keyword (**Balas Otomatis**). They pay a monthly or yearly subscription through the Nexadream Payment Hub.

**Status:** M1 foundation implemented locally (see `docs/HANDOFF.md` §1.1); next: choose the staging host, then M2. Use Node 24 via fnm (`.nvmrc`); the system Node 22.16 is too old for Nuxt 4.6.

**Commands:** `docker compose -f docker/compose.dev.yml up -d` · `npm run db:migrate && npm run db:seed` · `npm run dev` + `npm run tick:dev` · `npm run lint` · `npm run typecheck` · `npm test`. Dev logins: `admin@socialz.local` / `admin12345` (`/admin`), `demo@socialz.local` / `demo12345` (`/app`); emails land in Mailpit at http://localhost:8025.

## Read before coding

| Need | Document |
|---|---|
| **Current status, decisions log, next steps (start here in a new session)** | `docs/HANDOFF.md` |
| Platform layer (tenancy, auth, RBAC, plans, billing, payments, admin, settings, notifications, API and UI conventions) | `docs/blueprint/` (start with `README.md`, then files in numeric order) |
| Serverless runtime contract, supported hosts, deploy contract | `docs/blueprint/19-serverless-and-portability.md` |
| Background jobs (job table, tick, kicks, leases, schedules) | `docs/blueprint/15-background-jobs.md` |
| Domain design (channel adapters, publishing pipeline, short links, Etalase, auto-reply, security) | `docs/ARCHITECTURE.md` |
| Platform API facts and limits (Meta, TikTok, YouTube, X, Neon, payments) | `docs/PLATFORM-CONSTRAINTS.md` |
| Milestones and the Meta review critical path | `docs/ROADMAP.md` + `docs/blueprint/17-implementation-plan.md` |
| Screens and UX brief | `docs/SCREENS.md` |
| How to add a domain feature | `docs/blueprint/18-domain-layer-guide.md` |

## Stack

Nuxt 4 (Nitro) · Nuxt UI v4 · `@nuxtjs/i18n` (id default, en) · Drizzle ORM + `pg` · Neon Postgres (pooled URL for all runtime code, direct URL for migrations in CI only) · better-auth (two instances: creator `/api/app/auth`, staff `/api/admin/auth`) · Postgres `jobs` table run by a per-minute HTTP tick + `waitUntil` kicks (publishing, DMs, billing schedules) · Cloudflare R2 · ffmpeg in a separate media processor container · Resend · Nexadream Payment Hub · zod 4 · Vitest + Playwright.

**Hosting: serverless and provider-agnostic.** The host is picked at build time with a Nitro preset (`NITRO_PRESET`): any VPS (`node-server`), Cloud Run, AWS Lambda, Vercel, Netlify, Cloudflare… Cloudflare sits in front of every domain. No code may depend on one host's proprietary features.

## Non-negotiables

1. **Simplicity first.** A first-time creator reaches their first scheduled post in under 5 minutes without docs. Plain Bahasa (no "webhook", "token", "API", "slug" in the UI), smart defaults, advanced options behind "Opsi lanjutan", errors that explain the fix, phone first. No feature may add steps to the newcomer path.
2. **Every workspace-owned row carries `workspaceId`**, and every console query filters by it via `requireWorkspaceContext()`.
3. **Handlers are thin; logic lives in `server/core/**`**, which takes a `ctx` (never an `H3Event`) and uses **no Nitro auto-imports**, because job handlers, scripts, tests and the media processor run the same code.
4. **Role = 403, plan = 402.** Role check first, then plan. Plan limits and features are data read only through the entitlements module, never by plan slug.
5. **Only `transitionSubscription()` writes `subscriptions.status`**, and every subscription write appends a `subscription_events` row.
6. **Never fulfil a payment from callback content.** The hub callback is a nudge: re-read the status with `getStatus`, and match `gatewayOrderId` exactly.
7. **Money:** gateway amounts are integer rupiah; other money is `numeric(14,2)`, a plain number over the wire. Never floats.
8. **Provider vocabulary stays in its adapter** (payments, email, storage, auth, social channels).
9. **Secrets at rest are encrypted** (settings secrets, gateway keys, social account tokens) and never returned raw.
10. **Publishing is DB-driven.** Jobs are triggers; state lives in `post_targets`; never blindly retry `media_publish` (use `publish_unknown` → reconcile). Any invocation can die at any line: persist the step before the external call, and rely on leases.
11. **Webhooks:** verify (Meta HMAC with the matching app secret), store with a dedupe key, enqueue in the same transaction, return 200 fast, then kick via `waitUntil`.
12. **Downgrade never deletes data.** Excess accounts, rules and Etalase pages are deactivated, and the owner picks which stay active.
13. **Language:** users read Bahasa Indonesia (English secondary locale); developers read English (identifiers, enum values, codes, comments, docs, commits). Every enum is rendered through a label map.
14. **Reference data** (permissions, menus, settings, templates, plans, job schedules) ships in a migration **and** in the seed.
15. **Serverless runtime contract** (`docs/blueprint/19` §2): stateless invocations; no `setInterval`, in-memory queues or `SIGTERM` hooks; after-response work only through `waitUntil` / `ctx.defer`; shared state in Postgres; ≤ 4 MB request bodies; no native modules in functions; pooled DB URL only; never read host-specific env vars. Ticks can be missed, doubled or overlap, so jobs process everything due and claim with `SKIP LOCKED`.
16. **Migrations are expand / contract**: each one must work with both the previous and the next release.

## Conventions

- Drizzle with `casing: 'snake_case'`; uuidv7 text ids; deterministic ids for seeded rows; UTC timestamps.
- Errors: `createError({ statusCode, statusMessage: '<Bahasa sentence>', data: { code } })`.
- Lists are server-paginated: `{ items, meta: { page, limit, total, pageCount } }`.
- ESLint stylistic: `commaDangle: 'never'`, `braceStyle: '1tbs'`.
- `CHANGELOG.md` entry for every change (`## x.y.z (Draft)` → `(Released)`); `package.json` version matches.
- Dark mode and phone / tablet / desktop checked for every new page.

## Deliberately out of scope (do not half-build)

- Mobile app, `/api/v1`, public API keys, push notifications (FCM)
- Agency features beyond the plan-gated team page (client workspaces, approval flows, multi-workspace switching)
- Unified DM/comment inbox
- TikTok, YouTube and X adapters (post-v1; the adapter contract already allows them)
- Recurring auto-debit billing (the Nexadream hub has no recurring API; renewal is a manual checkout with reminders)
- Affiliate commission sync (Shopee / Involve Asia APIs; post-v1)
- Multi-location / branches

## Open items (ask the human)

- Short link + Etalase domain name, media domain, support email
- Nexadream Payment Hub platform API key and issued order prefix
- Reference staging host (function host + container host for the media processor), chosen at M1 from `docs/blueprint/19` §4
- Meta Business Verification status and Meta app IDs
