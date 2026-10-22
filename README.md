# Socialz.id

Multi-tenant SaaS for Indonesian affiliate creators: schedule posts to Instagram, Threads and Facebook Pages, tracked short links, a link-in-bio storefront (Etalase) and comment-to-DM auto replies (Balas Otomatis). Subscriptions are paid through the Nexadream Payment Hub.

Nuxt 4 (Nitro) · Nuxt UI v4 · Drizzle + Postgres (Neon in production) · better-auth · Postgres job table driven by an HTTP tick · Cloudflare R2 · ffmpeg media processor container · Resend.

| Read | For |
|---|---|
| `CLAUDE.md` | Rules every change must follow (non-negotiables, conventions) |
| `docs/HANDOFF.md` | Current status, decisions log, open items, next steps |
| `docs/blueprint/` | Platform layer (tenancy, auth, billing, jobs, serverless contract) |
| `docs/ARCHITECTURE.md` | Domain design (channels, publishing, short links, Etalase, auto reply) |
| `deploy/README.md` | Per-host deploy details |

## Contents

1. [Requirements](#requirements)
2. [Local development (localhost)](#local-development-localhost)
3. [Connecting real social accounts in development (tunnel)](#connecting-real-social-accounts-in-development-tunnel)
4. [Tests and checks](#tests-and-checks)
5. [Deployment](#deployment)
6. [Troubleshooting](#troubleshooting)

## Requirements

| Tool | Why | Install (macOS) |
|---|---|---|
| Node 24 | Nuxt 4.6 needs it; the system Node 22.16 is too old | `fnm install` (reads `.nvmrc`), then `fnm use` |
| Docker Desktop | Postgres, Mailpit and the S3 mock run in containers | docker.com |
| ffmpeg | The media processor converts photos and videos with it | `brew install ffmpeg` |
| cloudflared | Only to connect real Instagram / Threads / Facebook accounts locally | `brew install cloudflared` |

## Local development (localhost)

This mode uses **fake social accounts** (`ADAPTER_MODE="fake"`): connecting Instagram, Threads or Facebook skips Meta and returns built-in test accounts. Everything runs on `localhost`.

### First time

```sh
fnm use                                          # Node 24
npm install
cp .env.example .env
docker compose -f docker/compose.dev.yml up -d   # Postgres, Mailpit, S3 mock
npm run db:migrate && npm run db:seed
```

### Every day

Start Docker Desktop, then run each of these in its own terminal:

| Command | What it runs | Port |
|---|---|---|
| `docker compose -f docker/compose.dev.yml up -d` | Postgres, Mailpit, S3 mock (stand-in for R2) | 5432, 8025, 9090 |
| `npm run dev` | The Nuxt app (site, `/app`, `/admin`, API) | 3000 |
| `npm run tick:dev` | Calls the job tick every 15 s, like the production cron. Publishes scheduled posts, sends DMs and emails, runs billing schedules | — |
| `npm run media:dev` | Media processor: converts uploads (JPEG, H.264 MP4). Without it, uploads stay "processing" | 3200 |

`tick:dev` and `media:dev` read `.env` themselves.

| URL | What |
|---|---|
| http://localhost:3000 | Public site |
| http://localhost:3000/app | Creator console: `demo@socialz.local` / `demo12345` |
| http://localhost:3000/admin | Staff back-office: `admin@socialz.local` / `admin12345` |
| http://localhost:8025 | Mailpit: every email the app sends lands here |
| http://localhost:3000/healthz | Database, tick and media processor health (503 while `tick:dev` is not running) |

### Fake mode notes

- Every workspace gets the **same** fake account IDs. An account can only be connected to one workspace, so a second user connecting the same fake Instagram gets "Akun ini sudah terhubung ke akun Socialz.id lain". Use the demo user, or disconnect the account in the other workspace first.
- A caption containing `[fail:auth]`, `[fail:rate_limit]`, `[fail:validation]`, `[fail:unknown]`… forces that publish error (`server/core/channels/fake.ts`).

### Useful scripts

| Script | Does |
|---|---|
| `npm run db:reset` | Drops everything, migrates and seeds again |
| `npm run db:generate` | Generates a migration from schema changes (expand / contract, see `CLAUDE.md` §16) |
| `npm run db:studio` | Drizzle Studio |

## Connecting real social accounts in development (tunnel)

Meta only sends a login back to an **https** address (Instagram and Threads reject `http://localhost`), and when it publishes, Instagram **downloads the photo from its URL** on Meta's servers. So in development both the app and the media storage must be reachable from the internet. A [Cloudflare named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) gives two stable https hostnames that point at your Mac:

| Hostname (example) | Points at | Used for |
|---|---|---|
| `socialz.fajrsyauqi.com` | `http://localhost:3000` | The app, login callbacks, webhooks |
| `socialz-media.fajrsyauqi.com` | `http://localhost:9090` | Uploads and public media URLs (S3 mock) |

Use a single subdomain level (`socialz-media.example.com`, not `media.socialz.example.com`): Cloudflare's free certificate only covers `*.example.com`.

### One-time setup

**1. Create the tunnel** (the domain must be in your Cloudflare account):

```sh
cloudflared tunnel login                                   # opens the browser; pick the domain
cloudflared tunnel create socialz-dev                      # prints the tunnel ID
cloudflared tunnel route dns socialz-dev socialz.fajrsyauqi.com
cloudflared tunnel route dns socialz-dev socialz-media.fajrsyauqi.com
```

**2. Write `~/.cloudflared/config.yml`:**

```yaml
tunnel: <tunnel-id>
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: socialz.fajrsyauqi.com
    service: http://localhost:3000
  - hostname: socialz-media.fajrsyauqi.com
    service: http://localhost:9090
  - service: http_status:404
```

Check it with `cloudflared tunnel ingress validate`.

**3. Add a Cloudflare cache rule** (dashboard → your domain → Caching → Cache Rules): hostname equals `socialz.fajrsyauqi.com` → **Bypass cache**, Browser TTL **Respect origin**. Without it, Cloudflare's Browser Cache TTL makes browsers keep Vite's dev files, and the app loads as a **blank page** (see [Troubleshooting](#troubleshooting)).

**4. Set `.env`:**

```sh
NUXT_PUBLIC_SITE_URL="https://socialz.fajrsyauqi.com"
NUXT_PUBLIC_SHORT_URL="https://socialz.fajrsyauqi.com"
NUXT_PUBLIC_MEDIA_URL="https://socialz-media.fajrsyauqi.com/socialz-media"
R2_ENDPOINT="https://socialz-media.fajrsyauqi.com"
ADAPTER_MODE="real"
META_APP_ID / META_APP_SECRET            # Facebook Login (Pages)
INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET  # Instagram business login: its own app ID, not the Meta app ID
THREADS_APP_ID / THREADS_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN                # any long random string; must match the Meta webhook setting
```

`nuxt.config.ts` allows the host of `NUXT_PUBLIC_SITE_URL` in the Vite dev server, so no other change is needed.

**5. Register the addresses in the Meta app dashboard** (developers.facebook.com/apps). Meta compares them **exactly**: `https`, no trailing `/`, no spaces.

| Where | Field | Value |
|---|---|---|
| App settings → Basic | App domains | `socialz.fajrsyauqi.com` |
| Facebook Login → Settings | Valid OAuth Redirect URIs | `https://socialz.fajrsyauqi.com/api/app/channels/facebook/callback` |
| Instagram → API setup with Instagram business login → step 4 "Set up Instagram business login" → **Business login settings** pop-up (save inside the pop-up) | OAuth redirect URIs | `https://socialz.fajrsyauqi.com/api/app/channels/instagram/callback` |
| Threads → Settings | Redirect Callback URLs | `https://socialz.fajrsyauqi.com/api/app/channels/threads/callback` |
| Threads → Settings | Uninstall / Delete callback URLs | `https://socialz.fajrsyauqi.com/api/meta/deauthorize`, `https://socialz.fajrsyauqi.com/api/meta/data-deletion` |
| Instagram → step 3 "Configure webhooks" (only for Balas Otomatis) | Callback URL / Verify token | `https://socialz.fajrsyauqi.com/api/webhooks/meta` / the value of `META_WEBHOOK_VERIFY_TOKEN` |

Do not confuse the Instagram **webhook** URL (step 3) with the **OAuth redirect** (step 4): putting the callback address in the webhook field leaves login failing with "Invalid redirect_uri".

**6. Testers.** While the Meta app is in Development mode, only accounts with a role on the app can log in:

- Instagram: App roles → add the account as Instagram tester, then accept in Instagram (Settings → Website permissions → Apps and websites → Tester invites). The account must be **Business or Creator**, not personal.
- Threads: add the account as Threads tester and accept the invite the same way.
- Facebook: your Facebook user needs a role on the app and must be an admin of the Page.

Meta delivers **webhooks only once the app is Live** (published). Connecting accounts and publishing work in Development mode; comment-to-DM does not.

### Every day (tunnel mode)

Start Docker Desktop, then one terminal each:

```sh
cloudflared tunnel run socialz-dev
docker compose -f docker/compose.dev.yml up -d
npm run dev
npm run tick:dev
npm run media:dev
```

Open the app at **https://socialz.fajrsyauqi.com**, not `localhost:3000`: sign-in only accepts the origin in `NUXT_PUBLIC_SITE_URL`. Log in with your own account, not the demo user, to connect your real accounts.

The first load of each page takes **about 20 seconds**: in dev mode Vite serves around 1,000 unbundled files, each one a round trip through Cloudflare. For faster pages, run a production build behind the same tunnel (no hot reload): stop `npm run dev`, then `npm run build && node --env-file=.env .output/server/index.mjs`.

To go back to plain localhost, restore the `NUXT_PUBLIC_*_URL` and `R2_ENDPOINT` values from `.env.example` (and `ADAPTER_MODE="fake"` if you have no Meta app).

## Tests and checks

```sh
npm run lint
npm run typecheck
npm test            # Vitest (uses the socialz_test database created by docker/init-test-db.sql)
npm run test:e2e    # Playwright
```

Every change gets a `CHANGELOG.md` entry; `package.json` version matches the top entry.

## Deployment

The app is **one Nitro build that runs on any host**; the host is chosen at build time with `NITRO_PRESET`. Production has no containers except the media processor. Full details per host: `deploy/README.md`; runtime contract: `docs/blueprint/19-serverless-and-portability.md`.

### What production needs

| Piece | Service | Notes |
|---|---|---|
| App (functions) | Any host: VPS / Docker (`node-server`), Cloud Run, AWS Lambda, Vercel Pro… | `deploy/<target>/`; region Singapore |
| Database | Neon Postgres | **Pooled** URL in `DATABASE_URL` for the app; **direct** URL only for migrations in CI |
| Media storage | Cloudflare R2 bucket with a public media domain | `R2_*`, `NUXT_PUBLIC_MEDIA_URL`; leave `R2_ENDPOINT` empty |
| Media processor | `services/media-processor/Dockerfile` on any container host | Reachable at `MEDIA_PROCESSOR_URL`, shares `MEDIA_PROCESSOR_SECRET` |
| Tick | One cron entry every minute + a backup pinger | `GET https://<site>/api/internal/tick` with `Authorization: Bearer $CRON_SECRET` |
| Email | Resend | Key set in `/admin` → Pengaturan |
| Payments | Nexadream Payment Hub | Key and order prefix set in `/admin` → Payment gateway |
| DNS / edge | Cloudflare in front of every domain | SSL Full (strict), short-domain transform rule, rate limits (`deploy/README.md`) |

Environment variables: `.env.production.example` (generate secrets with `openssl rand -base64 48`). Production uses `ADAPTER_MODE="real"` (the default) and never sets `R2_ENDPOINT`.

| Target | Preset | Tick source | Media processor |
|---|---|---|---|
| Any VPS / Docker host | `node-server` | `tick` service in `deploy/docker/compose.yml` + external pinger | Same compose |
| Google Cloud Run | `node-server` (container) | Cloud Scheduler | Cloud Run service |
| AWS Lambda | `aws-lambda` | EventBridge Scheduler | Lambda container image or Fargate |
| Vercel (Pro: per-minute cron) | `vercel` | Vercel Cron | External container host |

### Release order

```sh
npm ci && npm run lint && npm run typecheck && npm test
DATABASE_URL_DIRECT=… npm run db:migrate      # CI only; migrations are expand / contract
NITRO_PRESET=<preset> npm run build            # the build never migrates
# deploy with the target's CLI or git integration
curl -fsS https://<site>/healthz              # 200 once the first tick has run
```

**First deploy only:** run `npm run db:seed` once against the new database (superadmin from `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`, plans, templates, legal drafts). Never re-run it on a live environment; reference data ships inside migrations.

### After the first deploy

1. Sign in at `/admin`, change the superadmin password.
2. Pengaturan (company, email → "Kirim email uji", billing, privacy, app, channels) → Payment gateway (activate) → Paket (prices) → Halaman (legal pages reviewed; privacy and terms must be live before Meta App Review) → Staf.
3. Register with the Payment Hub: webhook `https://<site>/api/webhooks/payments/nexadream_hub`; redirects `https://<site>/app/billing?status=success|failed|pending`. Until the hub key exists, non-production environments can use the payment simulator (`docs/blueprint/08` §11).
4. Register with Meta, the same table as [the development setup](#one-time-setup) with `<site>` instead of the tunnel host: OAuth redirects `https://<site>/api/app/channels/<platform>/callback`, webhook `https://<site>/api/webhooks/meta` (field `comments` for Instagram), data deletion `/api/meta/data-deletion`, deauthorize `/api/meta/deauthorize`. Then App Review (`docs/ROADMAP.md`).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Akun ini sudah terhubung ke akun Socialz.id lain" | The same platform account is active in another workspace. In fake mode every workspace gets the same fake IDs: use the demo user, or disconnect it there first. For real accounts, set `ADAPTER_MODE="real"`. |
| Meta: "Invalid redirect_uri" | The callback address is not registered on that platform's app, is in the wrong field (Instagram: step 4 pop-up, not the step 3 webhook), was not saved inside the pop-up, or differs by a character. The app sends exactly `<NUXT_PUBLIC_SITE_URL>/api/app/channels/<platform>/callback` with the platform's own app ID. |
| Blank page through the tunnel, console says *Expected a JavaScript module script but the server responded with a MIME type of "text/css"* | Cloudflare Browser Cache TTL. Add the cache rule from step 3, then clear the browser cache (Chrome: DevTools → Network → Disable cache, reload; Safari: Develop → Empty Caches). |
| Blank page through the tunnel for ~20 s, then it loads | Normal in dev mode (see "Every day (tunnel mode)"). |
| Upload fails: *Permission was denied for this request to access the `loopback` address space* | The app is on a public address but storage is on `localhost:9090`. Set `R2_ENDPOINT` and `NUXT_PUBLIC_MEDIA_URL` to the media tunnel hostname. |
| Upload stays "processing" | `npm run media:dev` is not running, or ffmpeg is missing. |
| Scheduled posts never go out, `/healthz` 503 | `npm run tick:dev` is not running. |
| Site returns 502 / 530 through the tunnel | 502: `npm run dev` is not running (or still restarting after an `.env` change). 530: `cloudflared tunnel run socialz-dev` is not running or still connecting. |
| "Blocked request. This host is not allowed" | `NUXT_PUBLIC_SITE_URL` does not match the host you opened; restart `npm run dev` after changing it. |
| Sign-in fails on `localhost:3000` while `NUXT_PUBLIC_SITE_URL` is the tunnel | Expected: use the tunnel address, or switch the URL back. |
