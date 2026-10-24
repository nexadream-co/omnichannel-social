# Handoff — Socialz.id (planning 2026-10-12, implementation through 2026-10-16)

This file lets a new Claude session (or another account) continue exactly where planning stopped. Read `CLAUDE.md` first, then this file.

## 1. Status

- **Phase (2026-10-16): v1 feature-complete locally.** Every build phase of `docs/blueprint/17` (1–14) is implemented, tested and screenshot-reviewed on branch `develop` (one commit per phase). Nothing is deployed yet; the remaining work needs the user's accounts, keys and decisions (§5).
- **2026-10-15: architecture refactored to serverless, provider-agnostic** (user request). Nitro presets + a Postgres job table run by a per-minute HTTP tick + a separate ffmpeg media processor container. Spec: `docs/blueprint/19`, `docs/blueprint/15`, `docs/ARCHITECTURE.md` §2–3, §8.
- **Git:** `main` = M1 foundation (`391ac7d`). `develop` = phases 4–14 on top. Merge `develop` → `main` when the user approves (no remote configured yet, CI has not run on GitHub).
- **Local environment:** Node 24.22 via fnm at `~/.local/share/fnm` (prefix `PATH=$HOME/.local/share/fnm/node-versions/v24.22.0/installation/bin:$PATH`; the shell runs under Rosetta). `docker compose -f docker/compose.dev.yml up -d` gives Postgres 17 (dev + test DBs), Mailpit (:8025) and an S3 mock (:9090, bucket `socialz-media`). `.env` uses `ADAPTER_MODE=fake` (no Meta keys needed).

### 1.1 What exists (2026-10-16)

| Area | Where | Notes |
|---|---|---|
| Foundation (M1) | jobs, auth, shells, i18n, CI | see `CHANGELOG.md` |
| Notifications, settings, templates, profile, team, data rights, Meta callbacks | Phases 4–5 | |
| Channel adapters (IG, Threads, FB) + fake adapter, account connect, media pipeline | Phase 6 | real adapters untested until Meta app IDs exist |
| Plans & entitlements, upgrade dialog | Phase 7 | |
| Composer, publishing pipeline (no blind retries), posts, calendar | Phase 8 | |
| Balas Otomatis: Meta webhook, rules, DM guards, activity | Phase 9 | |
| Link Produk, short links + clicks, Etalase (zero-JS public page), Statistik | Phase 10 | |
| Billing: Nexadream hub driver, checkout, callbacks, reconcile, billing.daily, downgrade enforcement, /app/billing, admin billing | Phase 11 | `scripts/mock-payment-hub.ts` stands in for the hub locally |
| Back-office: dashboard, reports, workspaces + impersonation, people & access, CMS, operations, audit, jobs | Phase 12 | |
| Public site: landing, pricing, legal pages, contact, SEO, robots/sitemap, legal drafts | Phase 13 | legal drafts need counsel review |
| Production readiness: `deploy/` (Docker/VPS, Cloud Run, AWS Lambda, Vercel), app + media images (built and smoke-tested), Playwright E2E (newcomer path < 5 min), CI e2e job | Phase 14 | |
| Rencana konten (planner, phase 1): Bank Ide, ideas on the Kalender (week view), Momen belanja + "Siapkan konten", weekly target, Jenis konten, idea → composer, `/admin/moments` | 2026-10-23 | `ARCHITECTURE` §8.8 |
| Rencana konten phase 2: bell reminders (`planner.weekly`, `planner.reminders`), Galeri "Jadikan ide", "Jadikan ide lagi", Beranda "Minggu ini", "Pasang Balas Otomatis" after scheduling | 2026-10-24 | best time, product suggestions and content mix still open |

**Checks:** `npm run lint`, `npm run typecheck`, `npm test` (≈221 unit + integration tests on real Postgres) and `npm run test:e2e` (5 specs, phone viewport) pass. `NITRO_PRESET=node-server` build smoke-tested; app and media Docker images built and smoke-tested.

**Run locally:** `npm run dev`, `npm run tick:dev` (jobs), `npm run media:dev` (ffmpeg processor). **Payments run in test mode** (`blueprint/08` §11): the seed activates the payment simulator outside production, checkout opens `/pay/simulator/:orderId` where you pick the outcome, and `/admin/workspaces/:id` has "Mode uji: simulasi waktu" to end trials, trigger reminders, end periods and grace without waiting. `npx tsx scripts/mock-payment-hub.ts` is only for testing the real hub driver's HTTP. Logins: `admin@socialz.local` / `admin12345` (`/admin`), `demo@socialz.local` / `demo12345` (`/app`).

**Known gaps (deliberate, small):** the Etalase page has no server route cache (its public API is CDN-cached 15 s); real Meta, R2, Resend and Google paths are unexercised until keys exist.

## 2. Document map

| File | Purpose |
|---|---|
| `CLAUDE.md` | Entry point: stack, non-negotiables, conventions, out-of-scope list, open items |
| `docs/blueprint/` (README + 01–18) | Platform layer spec: tenancy, auth, RBAC, plans, billing, Nexadream payments, admin, settings, notifications, API/UI conventions, jobs, implementation plan |
| `docs/ARCHITECTURE.md` | Domain spec: channel adapters, publishing pipeline, short links, Etalase, auto-reply, security, simplicity rules (§1.1) and simplicity budget (§19) |
| `docs/PLATFORM-CONSTRAINTS.md` | Verified Meta / TikTok / YouTube / X / Neon facts (Oct 2026), with confidence levels |
| `docs/ROADMAP.md` | Milestones M0–M8 (~14 weeks) and backlog |
| `docs/SCREENS.md` | Screen list / design brief (sent to the user's Claude Design account) |
| `docs/blueprint/17-implementation-plan.md` | Detailed build phases and definition of done |
| `docs/blueprint/19-serverless-and-portability.md` | Serverless runtime contract, supported hosts (tiers), deploy contract, media processor, Cloudflare routing |

The original generic blueprint the platform docs were adapted from is at `~/Downloads/saas-blueprint/` (outside the repo, reference only).

## 3. Decisions log (all confirmed by the user)

| Topic | Decision | Notes / rejected alternatives |
|---|---|---|
| Product | **Socialz.id**: SaaS for Indonesian affiliate creators (beginners included) | References: buffer.com (publishing), bitbybit.studio (Indonesian chat commerce), sosiakita.com (agency persona) |
| Customer | Individual affiliate creators | Agencies later (team page exists but plan-gated) |
| v1 focus | "Option A": publishing first, not inbox/commerce | |
| v1 channels | Instagram, Threads, Facebook Pages | TikTok, YouTube, X later |
| v1 features | Composer + scheduler; affiliate links + short links + Etalase bio page; IG comment-to-DM ("Balas Otomatis") | AI captions not in v1 |
| Guiding principle | **Simplicity for newcomers**: first scheduled post in < 5 min, plain Bahasa, smart defaults, "Opsi lanjutan" | Explicit user requirement |
| Stack | Nuxt 4 + Nuxt UI v4 + Drizzle + Neon + better-auth + R2 + Resend | The user chose "our architecture" over the blueprint's Prisma/JWT/cron stack |
| Database | Neon Postgres (user wrote "Nano Postgresql" = Neon) | Pooled URL for all runtime code; direct URL for migrations in CI only |
| Hosting (2026-10-15) | **Serverless, provider-agnostic**: Nitro preset chosen at build; Cloudflare in front of every domain; function region pinned to Singapore | Replaces "VPS + Docker + Caddy". Not tied to Vercel or Netlify (explicit user requirement). VPS stays valid as the `node-server` target |
| Jobs (2026-10-15) | Postgres `jobs` table + per-minute HTTP tick (`Authorization: Bearer CRON_SECRET`, Vercel's convention, which any cron source can send) + `waitUntil` kicks + leases + fan-out | Replaces the pg-boss worker. Rejected: QStash, Inngest / Trigger.dev, host queues (vendor coupling) |
| Media (2026-10-15) | ffmpeg in a separate media processor container behind a `MediaProcessor` adapter; presigned URLs + signed callback, no secrets inside | Runs on any container host. Rejected: transcoding SaaS (extra vendor), ffmpeg.wasm (slow on phones) |
| Media editor (2026-10-22) | Non-destructive recipe (`EditSpec`) saved as a **new** media row; photos rendered in the browser (Konva + canvas), videos by the existing ffmpeg processor from the same recipe plus one browser-drawn overlay PNG; free on every plan (edited copies count toward storage) | Rejected again: ffmpeg.wasm (phones). Auto subtitles from speech deferred (needs a speech-to-text vendor; the layer schema already has `startMs/endMs`) |
| Reference staging host | **Open**, pick at M1 from `blueprint/19` §4 tier 1 | Note: per-minute cron on Vercel needs Pro (Hobby is once a day) |
| Auth | Email + password and Google | Two better-auth instances: creator and staff |
| Payments | **Nexadream Payment Hub** (no recurring; manual renewal with reminders) | Midtrans was chosen earlier, then replaced |
| Roles | owner / editor / viewer (Pemilik / Editor / Pemantau) | Team page gated by feature `teamAccess` |
| Mobile app | None | No `/api/v1`, API keys or push |
| UI language | Bahasa Indonesia default + English | `@nuxtjs/i18n` `prefix_except_default` |
| Plans | Gratis; Kreator Rp49.000/mo, 14-day trial; Pro Rp99.000/mo seeded inactive | Values in `docs/blueprint/06` §2 (draft prices incl. PPN) |
| Company / domains | The user has a PT/CV (Meta Business Verification can start) and owns an app domain + short domain | Short domain name not shared yet |
| Content planner (2026-10-23) | Inside the Kalender (no new menu); ideas are their own table, never a post status; everything free on every plan (a retention feature, no plan keys); shopping moments are reference data staff edit at `/admin/moments`; rule-based, no AI | Phase 1 = Bank Ide, ideas on the calendar, moments, weekly target, pillar. Phase 2 (2026-10-24) = bell-only reminders (no email, so no unsubscribe setting yet) and shortcuts from Galeri, posts, Statistik, Beranda and the composer; all free. Still open: best time from own insights, forgotten/winning products, content mix (`ARCHITECTURE` §8.8) |
| Hashtags (2026-10-22) | Rule-based tag ideas, quality check and saved sets (free); research from own post results + Threads tag activity (paid, `tagResearchPerMonth`: Gratis 0, Kreator 100, Pro unlimited). Instagram's 5-tag limit enforced | No AI. Instagram hashtag search needs Facebook Login + Public Content Access, so it is phase 2. Threads search is off until Meta approves `threads_keyword_search` (`ARCHITECTURE` §8.7) |
| Etalase branding (2026-10-24) | Every Etalase on every plan shows the Socialz.id logo and a "Buat Etalase-mu sendiri, gratis" CTA; the `removeBranding` plan feature is removed (migration 0014) | Rejected: keep it as a paid feature; keep a small mark on paid plans with the CTA on Gratis only |

## 4. How this user works

- Wants **deep planning before coding**. They stopped execution twice to plan more ("do not start yet"). **Confirm before starting each major phase.**
- Values simplicity for beginner creators over agency power features.
- Prefers recommendations with options (they accept "(Recommended)" choices most of the time but override when they have context, e.g. Nexadream, Neon, current architecture).

## 5. Open items (ask the user)

1. Domains: short link + Etalase domain, media domain, support email (placeholders in `.env.production.example`).
2. Nexadream Payment Hub platform API key (`phk_live_…`) and order prefix; register the webhook/redirect URLs listed in `deploy/README.md`.
3. Meta: Business Verification status; app IDs/secrets for Instagram Login, Threads and Facebook Login for Business; webhook verify token. Then App Review (critical path).
4. Hosting choice: function host (tier-1 options in `deploy/README.md`) + container host for the media processor; Neon project (staging + production branches); R2 bucket; Resend key + domain; Google OAuth client.
5. Legal review of the seeded privacy policy, terms and payment policy (editable at `/admin/pages`).
6. Approval to merge `develop` → `main` and to add a Git remote.

## 6. Next steps

1. User provides §5 items → create Neon branches, R2, Resend, Cloudflare zones (transform rule from `deploy/README.md`).
2. Deploy staging with the chosen `deploy/<target>/` (the media processor **before** the app; give the R2 media domain a CORS rule allowing `GET` from the app origin, which the photo editor needs to draw on a canvas); run `npm run db:migrate` (direct URL) and `npm run db:seed` once; set the per-minute tick + a backup pinger; check `/healthz`.
3. Configure `/admin`: settings, payment gateway, legal pages, staff. Run the hub end-to-end test from `blueprint/17` Phase 11 against the real hub with a low-price plan.
4. Meta App Review submissions with the staging build (screencasts of connect → publish → comment-to-DM). Include `threads_keyword_search` (tag research); after approval turn on `channels.hashtags.threadsSearchEnabled` in `/admin/settings` and ask Threads users to reconnect.
5. Content planner, remaining ideas (`ARCHITECTURE` §8.8 "Later"): plan with the user before building.
6. Usability test with 5 first-time creators (target: first scheduled post in < 5 minutes), closed beta, then production.

## 7. In parallel (user, non-code, M0)

Meta Business Verification + Meta app setup; request the Nexadream hub API key + order prefix; Google OAuth consent screen; PSE registration; domains on Cloudflare; hosting accounts for the chosen function host and container host. The Meta review is the critical path (`docs/ROADMAP.md`).
