# Handoff — Socialz.id planning session (2026-10-12, updated 2026-10-15)

This file lets a new Claude session (or another account) continue exactly where planning stopped. Read `CLAUDE.md` first, then this file.

## 1. Status

- **Phase:** **M1 foundation implemented locally (2026-10-15)**, not yet deployed. See §1.1.
- **2026-10-15: architecture refactored to serverless, provider-agnostic** (user request). The VPS + Docker + Caddy + pg-boss worker topology is replaced by Nitro presets + a Postgres job table run by a per-minute HTTP tick + a separate ffmpeg media processor container. Spec: `docs/blueprint/19`, `docs/blueprint/15`, `docs/ARCHITECTURE.md` §2–3, §8.
- **Git:** docs committed as `9608de1`; the M1 code is not committed yet (ask the user).
- **Local environment:** Node **v22.16.0** at `/usr/local/bin/node` is too old (Nuxt 4.6 needs `^22.22.3 || ^24.15.0 || >=26`). Homebrew also has Node 24.1.0, also too old and shadowed by `/usr/local/bin`. The user chose **fnm + Node 24 LTS** (`brew install fnm`, shell hook in `~/.zshrc`, `.nvmrc` = `24`), but setup has **not** been run. Docker 29, psql 14 and bun 1.2.5 are installed; pnpm is not.

### 1.1 M1 status (2026-10-15)

Done and verified locally (Node 24.22 via fnm at `~/.local/share/fnm`, Docker `postgres:17` + Mailpit):
- Scaffold: Nuxt 4.6.1, Nuxt UI 4.12, i18n id/en, better-auth 1.7.10, Drizzle 0.45, zod 4, TypeScript 5.9 (vue-tsc does not support TS 7 yet).
- Full platform + domain schema (`server/core/db/schema/*`), first migration `0000_init.sql`, idempotent seed (permissions, roles, menus, settings, templates, plans, gateway row, job schedules, draft legal pages, FAQ, superadmin `admin@socialz.local`, dev demo creator `demo@socialz.local`).
- Job system (`server/core/jobs`): jobs table, runner with leases + budget + SKIP LOCKED, slot-claimed schedules, kick, fan-out signing, `/api/internal/tick`, `/api/internal/jobs/run`, `/healthz`, `maintenance.purge` + `system.noop` handlers.
- Auth: two better-auth instances behind the facade, register (workspace + 14-day trial), email verification and reset via Mailpit, per-email + per-IP limits in Postgres, gatekeepers, CSRF origin check, audit rows.
- UI: landing, creator auth pages, Beranda with the onboarding checklist, creator shell (rail / phone bottom nav), admin auth + dashboard with DB-driven sidebar; light/dark, phone/desktop checked by screenshot.
- Checks: `npm run lint`, `npm run typecheck`, `npm test` (34 tests, unit + integration on a real Postgres) all pass; `node-server`, `aws-lambda` and `vercel` presets build; the built `node-server` output passes a smoke test.
- CI: `.github/workflows/ci.yml` (lint, typecheck, tests with Postgres, preset build matrix). Not run yet (no remote).

Not done in M1 (needs the user or a later step):
- Staging deploy + cron entry: blocked on choosing the staging host (`blueprint/19` §4).
- Google sign-in: code path in place; untested until `GOOGLE_CLIENT_ID/SECRET` exist.
- Playwright E2E specs, change-password / profile pages, impersonation, invitations (later phases of `blueprint/17`).
- Shell `!` tip: add the fnm hook to `~/.zshrc` (`eval "$(fnm env --use-on-cd --shell zsh)"`); the shell runs under Rosetta, so install Node with `fnm install 24 --arch arm64`.

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
| Reference staging host | **Open**, pick at M1 from `blueprint/19` §4 tier 1 | Note: per-minute cron on Vercel needs Pro (Hobby is once a day) |
| Auth | Email + password and Google | Two better-auth instances: creator and staff |
| Payments | **Nexadream Payment Hub** (no recurring; manual renewal with reminders) | Midtrans was chosen earlier, then replaced |
| Roles | owner / editor / viewer (Pemilik / Editor / Pemantau) | Team page gated by feature `teamAccess` |
| Mobile app | None | No `/api/v1`, API keys or push |
| UI language | Bahasa Indonesia default + English | `@nuxtjs/i18n` `prefix_except_default` |
| Plans | Gratis; Kreator Rp49.000/mo, 14-day trial; Pro Rp99.000/mo seeded inactive | Values in `docs/blueprint/06` §2 (draft prices incl. PPN) |
| Company / domains | The user has a PT/CV (Meta Business Verification can start) and owns an app domain + short domain | Short domain name not shared yet |

## 4. How this user works

- Wants **deep planning before coding**. They stopped execution twice to plan more ("do not start yet"). **Confirm before starting each major phase.**
- Values simplicity for beginner creators over agency power features.
- Prefers recommendations with options (they accept "(Recommended)" choices most of the time but override when they have context, e.g. Nexadream, Neon, current architecture).

## 5. Open items (ask the user)

1. Short link + Etalase domain name; media domain; support email (placeholders `{{SHORT_DOMAIN}}`, `media.socialz.id`, `halo@socialz.id`).
2. Nexadream Payment Hub platform API key (`phk_live_…`) and the issued order prefix (`{{ORDER_PREFIX}}`).
3. Meta: Business Verification status, Meta app ID(s) for Instagram Login, Threads and Facebook Login for Business.
4. Approval to install fnm + Node 24 and to make the first commit.
5. Reference staging host: function host + container host for the media processor (`blueprint/19` §4).

## 6. Next step: M1 foundation (only after the user says start)

Follow `docs/blueprint/17-implementation-plan.md` Phases 1–3. Concrete checklist:

1. Install fnm, Node 24 LTS; add `.nvmrc` (`24`).
2. `git init` (if approved); `.gitignore`; `CHANGELOG.md` with `## 0.1.0 (Draft)`.
3. Scaffold Nuxt 4 (`npx nuxi@latest init` minimal template, npm) into the existing directory, keeping `docs/` and `CLAUDE.md`.
4. Add modules: `@nuxt/ui`, `@nuxt/eslint`, `@nuxtjs/i18n`; ESLint stylistic config (`commaDangle: 'never'`, `braceStyle: '1tbs'`).
5. Add deps: `drizzle-orm`, `drizzle-kit`, `pg`, `better-auth`, `zod`, `uuidv7`, `aws4fetch`, `cron-parser`, `p-limit`; dev: `tsx`, `vitest`, `@playwright/test`. (No `pg-boss`, no `esbuild` worker bundle.)
6. `docker/compose.dev.yml`: `postgres:17` + Mailpit.
7. `server/core/env.ts` (zod), `server/core/log.ts`, `server/core/db/client.ts` (one pooled `db`, small pool), `drizzle.config.ts` (direct URL), schema files from `docs/blueprint/02` (platform, incl. §3.7 jobs and rate limits) + `docs/ARCHITECTURE.md` §7 (domain), first migration, idempotent seed (incl. `job_schedules`).
8. Shared catalogs stubs (`shared/utils/*`), `server/utils/{auth,validate,http}.ts`, `server/core/{crypto,rate-limit,money,timezone}.ts`.
9. better-auth creator + staff instances, gatekeepers, auth pages, both shells (creator: bottom nav on phones), i18n id/en, dark mode.
10. Job skeleton (`docs/blueprint/15`): `enqueue`, `runDue`, `kick`, `runTick`, `/api/internal/tick`, `/api/internal/jobs/run`, `scripts/dev-tick.ts`, `/healthz`; runtime-contract lint rules (`blueprint/19` §2).
11. Portability spike: build `node-server`, `aws-lambda`, `vercel` presets in CI; on the chosen staging host verify `waitUntil`, `maxDuration`, region, Cloudflare short-domain rewrite, cron → tick.
12. Verify: `docker compose -f docker/compose.dev.yml up -d`, `npm run db:migrate && npm run db:seed`, `npm run dev` + `npm run tick:dev`; sign up → verification email in Mailpit → log in (email; Google if keys set) → switch id/en; staff login at `/admin`; `/healthz` shows a fresh tick; a `system.noop` job runs via kick; `npm run lint`, `npm run typecheck`, `npm test` pass.

## 7. In parallel (user, non-code, M0)

Meta Business Verification + Meta app setup; request the Nexadream hub API key + order prefix; Google OAuth consent screen; PSE registration; domains on Cloudflare; hosting accounts for the chosen function host and container host. The Meta review is the critical path (`docs/ROADMAP.md`).
