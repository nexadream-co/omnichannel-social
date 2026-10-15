# Socialz.id — Implementation Blueprint

This folder is the **implementation-level specification of the Socialz.id platform layer**: tenancy, auth, RBAC, plans, billing, payments, notifications, settings, admin, API conventions and front-end patterns. It was adapted from a proven multi-tenant subscription SaaS blueprint, re-targeted to the Socialz.id stack and business.

**Socialz.id** is a SaaS for **Indonesian affiliate creators**, from complete beginners to experienced sellers. Creators sign up, get a free trial, and pay a monthly or yearly subscription. Inside the app they:
- schedule posts to Instagram, Threads and Facebook Pages (TikTok, YouTube and X come later);
- keep their affiliate product links (Shopee, TikTok Shop, Tokopedia, Lazada) as tracked short links;
- run a public link-in-bio storefront, the **Etalase**;
- auto-send product links by Instagram DM when someone comments a keyword (**Balas Otomatis**).

Surfaces:
- a public **landing site** (`/`);
- the creator **web console** (`/app`);
- the platform **back-office** (`/admin`) where Socialz.id staff run everything (workspaces, plans, payments, content, templates, settings) without a redeploy;
- public **Etalase pages** and **short link redirects** on the short domain.

The domain features (channels, publishing, links, Etalase, auto-reply) are specified in [`../ARCHITECTURE.md`](../ARCHITECTURE.md). This blueprint specifies everything underneath them, and [`18-domain-layer-guide.md`](18-domain-layer-guide.md) is the bridge between the two.

---

## How an AI agent should use this folder

1. Read the root `CLAUDE.md`, then this `README.md` and `01-architecture.md`. They fix the vocabulary and the shape of the codebase.
2. Read the remaining files in numeric order before writing platform code. Later files assume earlier ones.
3. Treat every **MUST / NEVER** rule as a hard requirement. They exist because breaking them caused real bugs (billing, data leakage, lost payments) in the system this blueprint came from.
4. Build in the order given by `17-implementation-plan.md`.
5. When a Socialz.id feature needs something this blueprint does not cover, follow `18-domain-layer-guide.md`.
6. When a decision is open and expensive to reverse (a schema shape, an enum value, a URL other people depend on), **ask the human before building**. Cheap, reversible choices (a label's wording, an icon) you may decide yourself and report.
7. **Simplicity first** (see `../ARCHITECTURE.md` §1.1): a first-time creator must reach their first scheduled post in under 5 minutes without reading docs. No platform feature may add steps to that path.

---

## Project values

| Placeholder | Meaning | Socialz.id value |
|---|---|---|
| `{{APP_NAME}}` | Product display name | `Socialz.id` |
| `{{APP_KEY}}` | Lowercase identifier for storage keys, cookie prefixes, headers | `socialz` |
| `{{SITE_URL}}` | Public origin of the web app (landing + `/app` + `/admin`) | `https://socialz.id` |
| `{{SHORT_DOMAIN}}` | Short link + Etalase domain | **to confirm** (owned by the business, name not yet shared) |
| `{{MEDIA_DOMAIN}}` | Public R2 media domain | `media.socialz.id` (to confirm) |
| `{{SUPPORT_EMAIL}}` | Support inbox | `halo@socialz.id` (to confirm) |
| `{{ORDER_PREFIX}}` | Order-id prefix issued by the Nexadream Payment Hub to Socialz.id | **issued by the hub admin** |
| `{{LOCAL_ORDER_PREFIX}}` | Prefix of our own order ids | `SZ` |

Generic blueprint concepts are renamed for Socialz.id as follows. The rules attached to them are unchanged.

| Generic blueprint term | Socialz.id term (code) | UI label (Bahasa) | Notes |
|---|---|---|---|
| Tenant (customer business = billing account) | `workspace` | Ruang Kerja (rarely shown) | One per creator at signup |
| TenantUser (customer login) | `user` | Pengguna | better-auth tenant instance |
| User (platform staff) | `staff` / `staff_users` | Staf | better-auth platform instance |
| Roles `owner / manager / cashier` | `owner / editor / viewer` | Pemilik / Editor / Pemantau | |
| Branch (multi-location) | **removed** | — | Socialz.id has no locations |
| Branch-limit downgrade enforcement | Social-account-limit enforcement | "Pilih akun yang tetap aktif" | Same pattern (`05`, `07`) |
| `/api/v1`, API keys, mobile app, push (FCM) | **removed** | — | No mobile app is planned |
| Cron URLs | One signed per-minute tick that runs the Postgres `jobs` table and platform schedules | — | See `15-background-jobs.md` and `19` |
| SMTP via nodemailer | Resend over `fetch` | — | Credentials in DB settings |

---

## File map

| File | Covers |
|---|---|
| `01-architecture.md` | Stack, surfaces, directory layout, layering rules, env vars |
| `02-database-schema.md` | Drizzle schema for the platform layer + conventions |
| `03-auth-and-sessions.md` | Two audiences (two better-auth instances), Google OAuth, resets, invitations, impersonation |
| `04-rbac.md` | Platform RBAC (DB-driven), creator role presets, gatekeepers |
| `05-tenancy-and-onboarding.md` | Workspace model, signup, onboarding, team, suspend/delete/export |
| `06-plans-and-entitlements.md` | Plans as data, limits/features, 402 vs 403, downgrade rules, trial guard |
| `07-subscription-lifecycle.md` | Subscription state machine, events, checkout, cancel, grace, renewal |
| `08-payment-gateway.md` | Driver contract, Nexadream Payment Hub driver, webhooks, dedupe, replay, reconciliation |
| `09-admin-backoffice.md` | Every `/admin` screen, its endpoints and permissions |
| `10-platform-settings.md` | Settings catalog, storage, secrets, caching, admin editing |
| `11-notifications-and-email.md` | In-app bell, email (Resend), templates |
| `12-api-conventions.md` | `/api/public`, `/api/app`, `/api/admin`, webhooks; errors, pagination, validation |
| `13-tenant-console.md` | `/app` front-end: fetch client, auth composables, middleware, shell, billing page, upgrade dialog |
| `14-landing-and-public-site.md` | Marketing site, Etalase + short link surface, CMS pages, FAQ, contact form, SEO |
| `15-background-jobs.md` | Postgres job table, HTTP tick, kicks, leases: platform jobs (billing, reminders, purges) and domain queues |
| `16-cross-cutting.md` | Storage/uploads, audit log, crypto, rate limits, analytics, language, money, time |
| `17-implementation-plan.md` | Build order, verification, definition of done, pitfalls |
| `18-domain-layer-guide.md` | How Socialz.id features plug into the platform layer |
| `19-serverless-and-portability.md` | Serverless runtime contract, supported hosts, deploy contract, media processor, Cloudflare routing |

---

## The non-negotiables (summary)

These are repeated in detail in the relevant files. An implementation that violates one of them is wrong, however well it works in a demo.

1. **Every workspace-owned row carries `workspaceId`**, and every console handler scopes by it through `requireWorkspaceContext()`. A Drizzle query in a workspace handler without `workspaceId` in its `where` is a bug.
2. **Only `transitionSubscription()` writes `subscriptions.status`**, and every write to `subscriptions` also appends a `subscription_events` row.
3. **Plan limits and features are data, not code.** Read them only through the entitlements module; the code fixes only the *keys*.
4. **402 means "your plan doesn't allow this"; 403 means "your role doesn't".** Never mix them.
5. **Payment amounts are integers in the smallest currency unit** (IDR rupiah). Never `float`. Non-gateway money is `numeric(14,2)` in the DB and a plain number over the wire.
6. **Never fulfil a payment from callback content you cannot verify.** With the Payment Hub, the callback is only a nudge: re-read the status from the hub.
7. **Provider vocabulary lives only in its adapter file** (payment, storage, email, auth providers, **social channels**).
8. **Downgrade never deletes data.** Excess resources (social accounts, auto-reply rules, Etalase pages) are deactivated and come back on upgrade.
9. **Secrets at rest are encrypted** (AES-256-GCM): settings secrets, gateway keys, **social account tokens**. They are **never returned raw** over the wire, only masked.
10. **`/api/app/**` and `/api/admin/**` handlers are thin wrappers over `server/core/*` functions.** Logic lives in core, never in a handler. Job handlers call the same core functions.
11. **User-facing text in Bahasa Indonesia (English as a secondary locale); everything a developer reads in English.** Enum values, codes and field names stay English; labels come from a label map.
12. **Reference data ships through migrations**, not only through the seed.
13. **Scheduled publishing is DB-driven.** A job is only a trigger; state lives in `post_targets`. Never blindly retry a publish call (see `../ARCHITECTURE.md` §8).
