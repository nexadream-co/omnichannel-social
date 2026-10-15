# 01 — Architecture

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node 24 LTS** (fnm locally, `.nvmrc` = `24`) | Nuxt 4.6 requires `^22.22.3 \|\| ^24.15.0 \|\| >=26` |
| Hosting | **Serverless, provider-agnostic**: Nitro preset chosen at build (`NITRO_PRESET`) | Runtime contract, targets and deploy contract in `19`. `node-server` (VPS) stays a valid target |
| Framework | **Nuxt 4** (Vue 3, Nitro server) | One repo serves the landing site, both consoles, Etalase pages, short links and the API |
| UI kit | **Nuxt UI v4** (Tailwind v4, Reka UI) | Do not hand-roll components it already provides |
| i18n | `@nuxtjs/i18n`, strategy `prefix_except_default`, default `id`, secondary `en` | Labels in locale files; enum labels via label maps |
| Database | **PostgreSQL 17 on Neon** (`aws-ap-southeast-1`) | Pooled URL for all runtime code; direct URL for migrations in CI only; one Neon branch per environment |
| ORM | **Drizzle ORM** + `drizzle-kit`, driver `pg` (`neon-ws` on tier-2 targets, `19` §6) | Schema in `server/core/db/schema/*` |
| Validation | **zod 4** | Messages are user-facing, so they are written in Bahasa Indonesia |
| Auth | **better-auth**, two instances (creator, staff) with Drizzle adapter | DB sessions in HttpOnly cookies. Behind a facade (`03`) |
| Jobs | **Postgres `jobs` table** run by a per-minute HTTP tick + `waitUntil` kicks | No worker process, no queue vendor (`15`) |
| Email | **Resend** over plain `fetch` | Credentials live in DB settings, not env (`10`, `11`) |
| Storage | **Cloudflare R2** (S3-compatible) | Presigned browser uploads for post media; server uploads for small images (`16`) |
| Media processing | ffmpeg / ffprobe in the **media processor** container, behind the `MediaProcessor` adapter | Runs on any container host; holds no secrets (`19` §5) |
| Payments | **Nexadream Payment Hub** driver | Behind a driver contract (`08`) |
| Rich text | TipTap (admin CMS editor only) | Lazy-loaded |
| Tests | Vitest + Playwright | |
| Lint | `@nuxt/eslint` stylistic: `commaDangle: 'never'`, `braceStyle: '1tbs'` | |

`package.json` scripts:

```json
{
  "dev": "nuxt dev",
  "tick:dev": "tsx scripts/dev-tick.ts",
  "media:dev": "tsx watch services/media-processor/server.ts",
  "build": "nuxt build",
  "preview": "nuxt preview",
  "postinstall": "nuxt prepare",
  "lint": "eslint .",
  "typecheck": "nuxt typecheck",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx scripts/seed.ts",
  "db:reset": "tsx scripts/reset.ts && npm run db:migrate && npm run db:seed",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

`NITRO_PRESET` selects the target at build time (`19` §4); the scripts are the same for every host. Migrations are **not** run inside `build`. They run as a CI step before each deploy (`npm run db:migrate`), using the **direct** database URL, and follow the expand / contract rule (`19` §3).

`version` in `package.json` is surfaced as `runtimeConfig.public.appVersion` (shown in the `/admin` sidebar footer).

---

## 2. Surfaces and route boundaries

```
/                    Marketing landing site        SSR, anonymous, indexable
/app/**              Creator console               SPA (ssr: false), creator session cookie
/admin/**            Platform back-office          SPA (ssr: false), staff session cookie
/page/:slug, /privacy, /terms, /hapus-akun, /legal/data-deletion   SSR CMS/legal pages

SHORT_DOMAIN/{slug}      → /r/{slug}          short link redirect (server route)
SHORT_DOMAIN/@{handle}   → /bio/{handle}      public Etalase (SSR)

/api/public/**       Anonymous data for landing (plans, FAQ, company)
/api/app/**          Private API of the creator console (creator session)
/api/app/auth/**     better-auth creator instance (basePath)
/api/admin/**        Private API of the back-office (staff session)
/api/admin/auth/**   better-auth staff instance (basePath)
/api/webhooks/payments/[provider]   Payment Hub callbacks (no auth middleware)
/api/webhooks/meta                  Meta webhooks (signature-verified)
/api/meta/{data-deletion,deauthorize}  Meta platform callbacks
/api/internal/tick                  per-minute job tick (Bearer CRON_SECRET)
/api/internal/jobs/run              fan-out runner (HMAC)
/api/internal/media/callback        media processor results (HMAC)
/healthz             DB ping + last tick age + oldest due job
```

`nuxt.config.ts` (relevant parts):

```ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', '@nuxtjs/i18n'],
  ssr: true,
  routeRules: {
    '/app/**': { ssr: false },
    '/admin/**': { ssr: false }
  },
  i18n: { strategy: 'prefix_except_default', defaultLocale: 'id', locales: ['id', 'en'] },
  colorMode: { preference: 'light', fallback: 'light' },
  runtimeConfig: {
    // server-only values are read from env by server/core/env.ts (zod-validated)
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      shortUrl: process.env.NUXT_PUBLIC_SHORT_URL || 'http://localhost:3000',
      appEnv: process.env.NUXT_PUBLIC_APP_ENV || 'development',
      appVersion: pkg.version
    }
  }
})
```

Consequences:
- The global route middleware **short-circuits on the server** (`if (import.meta.server) return`), because both consoles are client-only.
- Landing, legal pages and Etalase pages are server-rendered for SEO and speed. `server/routes/robots.txt.ts` and `server/routes/sitemap.xml.ts` exist.
- A Cloudflare URL Rewrite rule maps the short domain onto `/r/*` and `/bio/*`; `server/middleware/00.host-guard.ts` blocks every other path on that host (`19` §7).
- **No `/api/v1`, no API keys, no mobile app, no push.** If a mobile app is ever planned, it gets its own decision and its own blueprint section.

---

## 3. Directory layout

```
app/
  app.vue, app.config.ts, error.vue
  assets/css/main.css              design tokens (@theme), no tailwind.config.js
  layouts/
    public.vue                     landing + CMS pages
    creator.vue / auth-creator.vue /app shell and its auth pages
    admin.vue  / auth-admin.vue    /admin shell and its auth pages
    bio.vue                        public Etalase
  middleware/auth.global.ts        route boundary guard (client only)
  composables/                     useCreatorAuth, useStaffAuth, useAuthClient, useEntitlements,
                                   useNotifications, usePageState, useServerList, useConfirmDialog,
                                   useAdminImpersonation, useDisplayTimezone …
  components/                      CreatorShell, AdminShell, CommandBar, StatusBadge, UpgradeDialog,
                                   TrialBanner, ImpersonationBanner, ReconnectBanner,
                                   composer/, calendar/, links/, bio/, autoreply/ …
  pages/
    index.vue, privacy.vue, terms.vue, hapus-akun.vue, page/[slug].vue, legal/data-deletion.vue
    bio/[handle].vue
    app/…                          creator console pages
    admin/…                        back-office pages
  utils/api-fetch.ts               the console $fetch wrapper (apiFetch)
  utils/format.ts                  currency / date formatting

server/
  api/
    public/  app/  admin/  webhooks/payments/[provider].post.ts  webhooks/meta.{get,post}.ts
    meta/  contact.post.ts
    internal/tick.ts, internal/jobs/run.post.ts, internal/media/callback.post.ts
  routes/r/[slug].get.ts, robots.txt.ts, sitemap.xml.ts, healthz.get.ts
  middleware/00.host-guard.ts      short-domain path guard (+ dev rewrite fallback)
  middleware/origin-check.ts       CSRF guard for mutating /api/app and /api/admin requests
  utils/                           NITRO-SIDE GLUE ONLY
    auth.ts                        gatekeepers: event → context (requireWorkspaceContext, requirePermission …)
    validate.ts, http.ts           zod readers, list query parsing, error helpers
  core/                            BUSINESS LOGIC — plain TS, explicit imports, NO Nitro auto-imports
    env.ts                         zod-parsed process.env
    db/{client.ts, schema/*.ts, migrations/}
    services/                      ADAPTERS — the only files that know a vendor
      auth/       types.ts, index.ts (facade), creator.ts, staff.ts (better-auth instances)
      payments/   types.ts, index.ts (registry), nexadream-hub.ts
      email/      types.ts, index.ts, resend.ts
      storage/    types.ts, index.ts, r2.ts
      media/      types.ts, index.ts, http.ts, local.ts, fake.ts   (MediaProcessor drivers)
    channels/                      social channel adapters (domain; see ../ARCHITECTURE.md §6)
    entitlements.ts, subscriptions.ts, checkout.ts, payment-apply.ts, payment-reconcile.ts,
    registration.ts, onboarding.ts, team.ts, settings.ts, crypto.ts, audit.ts, notifications.ts,
    email.ts, rate-limit.ts, uploads.ts, account.ts, last-seen.ts, timezone.ts, money.ts …
    publishing/, links/, bio/, autoreply/, media/   domain modules
    jobs/{queues,enqueue,runner,tick,schedules}.ts, jobs/handlers/*.ts   (see 15)
    log.ts                         JSON logger over console

shared/utils/                      CATALOGS — imported by server, media processor AND client
  plans.ts            LIMIT_KEYS, FEATURE_KEYS, labels, normalizers
  permissions.ts      platform permission keys (typed)
  workspace-abilities.ts  creator roles → abilities, presets
  menus.ts            default /admin menu tree + creator nav
  settings.ts         settings catalog
  payments.ts         payment provider catalog + status vocabulary
  templates.ts        default email + notification templates, renderer
  status.ts           every enum's label + badge colour
  email-brand.ts      HTML email wrapper
  channels/           channel capabilities + validators (domain)
  uploads.ts, phone.ts, breadcrumbs.ts …

services/media-processor/{Dockerfile,server.ts,transcode.ts}   ffmpeg container (see 19 §5)
scripts/{migrate,seed,reset,rotate-keys,dev-tick}.ts
i18n/locales/{id,en}.json
docker/compose.dev.yml             local Postgres 17 + Mailpit + media processor
deploy/<target>/                   host config only (vercel.json, netlify.toml, wrangler.toml, cloudrun.yaml …)
docs/
```

---

## 4. Layering rules

```
  console page / composable ──apiFetch──▶ /api/app/** handler ──┐
  admin page ──────────────────apiFetch──▶ /api/admin/** handler ┼─▶ server/core/<module>.ts ──▶ Drizzle
  tick / kick ─▶ /api/internal/** ─▶ server/core/jobs/handlers/* ┘            │
                                                                              └─▶ server/core/services/<adapter> ──▶ vendor
                                                                              └─▶ server/core/channels/<adapter>  ──▶ Meta APIs
```

1. **Handlers are thin.** A handler resolves a context with exactly one gatekeeper, validates input with zod, calls one core function, returns. Four-line handlers are the norm:

   ```ts
   // server/api/app/subscription/checkout.post.ts
   export default defineEventHandler(async (event) => {
     const ctx = await requireWorkspaceContext(event)
     const body = await readValidatedJson(event, checkoutSchema)
     return startCheckout(ctx, body)
   })
   ```

2. **Core owns the rules, including authorization.** Core functions take a **context object, never an `H3Event`**, so job handlers, scripts and tests call them too, on every host. A core function such as `startCheckout(ctx, input)` calls `assertAbility(ctx, 'billing.manage')` itself, so no surface can forget it. Job handlers build a `systemContext(workspaceId)` that carries the role `system`.
3. **Services are adapters.** Business code imports only from `server/core/services/<x>/index.ts` and `types.ts`. Vendor names, hosts, status strings and SDKs never appear outside the adapter file. Adding a vendor means one file plus one line in a registry (plus one catalog entry for payments). Social channels follow the same rule under `server/core/channels/`.
4. **Shared catalogs are the single source** of keys, labels and defaults for both server and client: permission keys, plan keys, settings, templates, status labels, channel capabilities. They are typed at compile time.
5. **`server/core/**` never uses Nitro or Nuxt auto-imports** (`useRuntimeConfig`, `createError` from auto-import, `$fetch`, `useStorage`…). It imports `createError` from `h3` explicitly, reads config from `env.ts`, gets `fetch` passed in where tests need to replace it, and receives after-response work as `ctx.defer` (never the event).
6. **`server/**` follows the serverless runtime contract** (`19` §2): stateless invocations, no timers, `waitUntil` for after-response work, ≤ 4 MB request bodies, no native modules, pooled database URL only.

---

## 5. Environment variables

```bash
# App
NUXT_PUBLIC_SITE_URL="https://socialz.id"
NUXT_PUBLIC_SHORT_URL="https://{{SHORT_DOMAIN}}"
NUXT_PUBLIC_MEDIA_URL="https://media.socialz.id"
NUXT_PUBLIC_APP_ENV="development"        # 'production' enables strict checks

# Database
DATABASE_URL="postgresql://…-pooler…/socialz?sslmode=require"   # all runtime code (pooled)
DATABASE_URL_DIRECT="postgresql://…/socialz?sslmode=require"    # migrations only, CI secret; never set on functions
DB_DRIVER="pg"                 # 'neon-ws' on tier-2 targets (19 §6)
DB_POOL_MAX="3"                # per function instance

# Jobs (15)
CRON_SECRET=""                 # REQUIRED; Bearer token the tick source sends
INTERNAL_SIGNING_SECRET=""     # REQUIRED; HMAC for /api/internal/jobs/run fan-out
JOBS_TIME_BUDGET_MS="45000"    # below the host's function maxDuration
JOBS_FANOUT_MAX="4"            # 0 disables self-invocation

# Media processor (19 §5)
MEDIA_PROCESSOR_DRIVER="http"  # 'local' in dev, 'fake' in tests
MEDIA_PROCESSOR_URL=""         # https://… of the container
MEDIA_PROCESSOR_SECRET=""      # HMAC for submit + callback

# Auth (two better-auth instances)
BETTER_AUTH_SECRET=""          # REQUIRED in production; long random
GOOGLE_CLIENT_ID=""            # optional; empty hides the Google button
GOOGLE_CLIENT_SECRET=""        # redirect: ${SITE_URL}/api/app/auth/callback/google

# Secrets at rest
SETTINGS_SECRET=""             # AES key source for settings, gateway keys and social tokens; REQUIRED

# Meta (infrastructure secrets stay in env)
META_APP_ID="" META_APP_SECRET="" META_GRAPH_VERSION="v25.0"
INSTAGRAM_APP_ID="" INSTAGRAM_APP_SECRET=""
THREADS_APP_ID="" THREADS_APP_SECRET=""
META_WEBHOOK_VERIFY_TOKEN=""

# Storage (R2)
R2_ACCOUNT_ID="" R2_ACCESS_KEY_ID="" R2_SECRET_ACCESS_KEY="" R2_BUCKET=""
R2_ENDPOINT=""                 # dev only: the local S3 mock (http://localhost:9090); empty = R2
STORAGE_DRIVER="r2"            # 'fake' in tests

# Dev / test
ADAPTER_MODE="real"            # 'fake' swaps channel adapters for in-memory fakes
```

`NITRO_PRESET` is a **build** variable, not read by app code. No host-specific variable (`VERCEL_URL`, `NETLIFY`…) is ever read.

**Not** in env, on purpose (they live in the DB and are edited in `/admin`): Resend API key and sender, Payment Hub credentials, company identity, billing rules, trial rules, maintenance mode, registration switch, the auto-reply kill switch, the affiliate domain allowlist.

---

## 6. Drizzle + Neon specifics

- One runtime client in `server/core/db/client.ts`: `db` = `drizzle(new Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX, idleTimeoutMillis: 10_000 }))` on the **pooled** host (PgBouncer transaction mode). Requests and job handlers share it. Do not use session features on it (LISTEN, session advisory locks, session `SET`); `SET LOCAL` inside a transaction is fine.
- The pool is created lazily per function instance and reused across warm invocations. Cache it on `globalThis` so Nitro hot reloads in development don't open new pools.
- `DB_DRIVER=neon-ws` swaps in `drizzle-orm/neon-serverless` for targets without TCP sockets (`19` §6); the query API is identical.
- `drizzle.config.ts` reads `DATABASE_URL_DIRECT`.
- Migrations are generated SQL files committed to the repo (`drizzle-kit generate`), applied by CI with the direct URL. **Never edit a migration that has already been applied**, and keep every migration compatible with the previous release (expand / contract, `19` §3).
- Partial unique indexes and reference-data inserts are written by hand in migration SQL when Drizzle can't express them.
- Never point a local `.env` at production.

---

## 7. In-process caches (best effort only)

Function instances are many, short-lived and unaware of each other. In-process caches therefore exist **only as accelerators**: each one has a short TTL, is correct when cold, and never decides anything that must be consistent across instances. They are cached on `globalThis` so warm invocations reuse them.

| Cache | TTL | Consistency across instances |
|---|---|---|
| Settings (`getAllSettings`) | 60 s | Changes reach every instance within 60 s; `setSetting()` clears the local copy at once |
| Entitlements per workspace | 60 s | Keyed by `workspaces.entitlements_version`; `invalidateEntitlements()` bumps it, so every instance sees the change on its next request |
| Short link slug → destination | 30 s | Edits and disables reach every instance within 30 s |

Rate-limit buckets and the `lastSeenAt` debounce are **not** in memory any more: they live in Postgres (`16` §4–5). Full table of what moved: `19` §6.
