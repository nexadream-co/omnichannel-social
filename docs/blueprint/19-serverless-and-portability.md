# 19 — Serverless Deployment and Portability

Socialz.id is **serverless and provider-agnostic**. One codebase builds for any host that Nitro supports, and the host is chosen **at build time** with a Nitro preset. No module may depend on one host's proprietary features (Vercel KV/Queues/Workflow, Netlify Blobs, Cloudflare Durable Objects, AWS SQS…). Each host-specific piece is either a **build preset**, a **deploy config file**, or an **adapter** behind a contract.

Status: design, decided 2026-10-15. Replaces the earlier "single VPS + Docker + Caddy + pg-boss worker" topology. A VPS stays valid as one target among many (the `node-server` preset).

## 1. What runs where

| Piece | Runs as | Portable because |
|---|---|---|
| Web app, API, webhooks, OAuth callbacks, short link redirects, Etalase SSR | **Functions** (Nitro build output) | Nitro presets: one source, many targets |
| Background jobs | The **same functions**: `/api/internal/tick` (cron), `/api/internal/jobs/run` (fan-out), and `waitUntil` kicks (`15`) | Any cron source that can make an HTTPS request with a header |
| Media transcoding (ffmpeg) | **Media processor**: one small container image | Any container host (serverless or not) runs an OCI image |
| Data, job queue, rate-limit counters | **Neon Postgres** (pooled URL) | Plain Postgres over TCP; no host involvement |
| Media files | **Cloudflare R2** (S3 API) | S3-compatible storage adapter |
| DNS, CDN, DDoS, geo headers, short-domain rewrite | **Cloudflare** in front of every domain | Sits in front of any origin |
| Email, payments | Resend, Nexadream Payment Hub | HTTP APIs behind adapters |

## 2. Runtime contract (MUST)

The baseline runtime is **Node-compatible functions** (Node 24 APIs). Every module in `server/**` and `shared/**` follows these rules so the same code runs on every preset in §4:

1. **Stateless invocations.** No correctness may depend on memory surviving between requests. In-process caches are allowed only as best-effort accelerators with a short TTL, and must be correct when cold (§6).
2. **No long-lived timers or background loops** (`setInterval`, `setTimeout` chains, `process.on('SIGTERM')`). Deferred work is a `jobs` row (`15`).
3. **Work after the response goes through `event.waitUntil()`** (handlers) or `ctx.defer()` (core). Never a floating promise.
4. **Time budget.** No request may assume more than `JOBS_TIME_BUDGET_MS` + 10 s of wall time. The host's function `maxDuration` is configured at least that high (60 s recommended).
5. **Filesystem is read-only**, except the OS temp dir for scratch files that are deleted in the same invocation. Nothing is stored on local disk.
6. **Request bodies ≤ 4 MB.** Large uploads go straight from the browser to R2 with presigned PUTs (`16` §1). This is the lowest common limit across hosts (Vercel 4.5 MB, AWS Lambda 6 MB).
7. **Database: pooled URL only, small pools.** `pg` `Pool` with `max: DB_POOL_MAX` (default 3) per instance, `idleTimeoutMillis: 10_000`. No session features (`LISTEN`, session advisory locks, session `SET`, prepared statements that survive a transaction). `SET LOCAL` inside a transaction is fine.
8. **Config from env only, read through `server/core/env.ts`.** Never read a host-specific variable (`VERCEL_URL`, `NETLIFY`, `CF_PAGES`…) in app code. The few host differences live in the deploy config (§4).
9. **Native modules are not allowed in the function bundle** (no `sharp`, no `ffmpeg` binaries, no `bcrypt` native). Pure JS or WebAssembly only. Anything native lives in the media processor.
10. **Outbound HTTP uses `fetch`** passed in through the context, so tests can replace it. `safe-fetch` (`../ARCHITECTURE.md` §11) needs `node:dns` for IP pinning; it is part of the Node baseline. If a Workers target is used (§4, tier 2), `safe-fetch` falls back to the DNS-over-HTTPS resolver (documented in the spike).
11. **Logs are JSON lines on stdout** through `server/core/log.ts` (a small logger over `console`, pino-compatible fields: `level`, `msg`, `requestId`, `jobId`, `workspaceId`). Every host captures stdout.
12. **Function region is pinned next to the database** (Singapore, near Neon `aws-ap-southeast-1`). Never deploy server functions to "global" or edge regions: every request talks to Postgres, so distance to the database dominates latency. Static assets are served by the host CDN and Cloudflare.

A lint rule (`no-restricted-globals` / `no-restricted-imports`) blocks `setInterval`, `process.on`, `node:fs` writes and host SDKs inside `server/**`, apart from the allowlisted files.

## 3. The deploy contract

Every target, whatever the host, provides the same six things:

| # | Requirement | Notes |
|---|---|---|
| 1 | Build with `NITRO_PRESET=<preset> npm run build` | Preset per §4. The build never runs migrations |
| 2 | Env vars from `01` §5 | Secrets in the host's secret store |
| 3 | Custom domains: `socialz.id` and `SHORT_DOMAIN` attached to the app | Cloudflare proxies both (§7) |
| 4 | **One cron entry**: every minute → `GET https://socialz.id/api/internal/tick` with `Authorization: Bearer $CRON_SECRET` | From the host's cron or an external pinger (§4) |
| 5 | Function `maxDuration` ≥ 60 s for `/api/internal/**`; default for the rest | |
| 6 | Media processor image deployed on any container host, reachable over HTTPS at `MEDIA_PROCESSOR_URL` | §5 |

**Release order** (CI, host-independent):

1. `npm run lint && npm run typecheck && npm test`.
2. `npm run db:migrate` against `DATABASE_URL_DIRECT` (CI secret; the direct URL is never given to the functions).
3. Seed reference data (idempotent): permissions, menus, settings, templates, plans, `job_schedules`.
4. Deploy the functions with the host's CLI or Git integration.
5. Smoke check `/healthz`.

**Migrations are expand / contract.** During a serverless rollout, old and new function versions run at the same time for a while, and a rollback brings old code back on the new schema. So every migration must work with **both** the previous and the next release: add columns nullable or with defaults, backfill in a job, and drop or rename only in a later release. Never edit a migration that has already been applied.

## 4. Supported targets

Tier 1 = verified in CI or staging. Tier 2 = expected to work, verified in a spike before use. Host limits marked *(verify)* must be confirmed at M1 against the host's current docs.

| Target | Nitro preset | Tick source | Media processor | Tier | Notes |
|---|---|---|---|---|---|
| Any VPS / Docker host (Fly.io, Railway, Render, own VPS) | `node-server` | System cron, a cron container, or an external pinger | Same host, second container | 1 | The always-valid fallback. `waitUntil` is a tracked promise |
| Google Cloud Run | `node-server` (container) | Cloud Scheduler | Cloud Run service | 1 | `asia-southeast1` / `asia-southeast2`. Request timeout configurable to 60 min |
| AWS Lambda | `aws-lambda` | EventBridge Scheduler | Lambda container image (max 15 min) or ECS Fargate | 1 | `ap-southeast-1`, same region as Neon |
| Vercel | `vercel` | Vercel Cron (`vercel.json` `crons`) | External container host | 1 | **Per-minute cron needs Pro**; Hobby allows once a day with ±59 min precision. Region `sin1` |
| Netlify | `netlify` | Netlify Scheduled Functions | External container host | 2 | Scheduled function duration limit is short *(verify)*: set `JOBS_TIME_BUDGET_MS` below it and rely on fan-out |
| Cloudflare Workers | `cloudflare-module` | Cron Triggers | External container host | 2 | Needs `nodejs_compat`. `pg` over TCP or the Neon serverless driver (`DB_DRIVER=neon-ws`, §6). Spike before use |
| Azure Functions / Container Apps | `azure-functions` / `node-server` | Timer trigger | Container Apps | 2 | |

**External pinger** (works with every target): any HTTP cron service that runs every minute and sends a custom header (for example cron-job.org or an uptime monitor with headers). Keep a second pinger as a backup: ticks are idempotent, so two sources are harmless.

**What lives in the repo for each target:** only deploy config (`vercel.json`, `netlify.toml`, `wrangler.toml`, `deploy/cloudrun.yaml`, `deploy/compose.yml`…) under `deploy/<target>/`, generated or copied at deploy time. No target's file is imported by app code.

## 5. Media processor

`services/media-processor/` is the one non-function component, because ffmpeg is a native binary and video jobs run for minutes.

```
services/media-processor/
  Dockerfile          node:24-slim + ffmpeg/ffprobe, non-root, read-only rootfs except /tmp
  server.ts           POST /process  (HMAC-verified)  → 202, work async, callback
                      GET  /healthz
  transcode.ts        imports server/core/media/{probe,ffmpeg-args}.ts (pure, shared)
```

- **Contract** (`server/core/services/media/types.ts`):

  ```ts
  interface MediaProcessor {
    submit(job: { assetId: string; ref: string; sourceUrl: string; kind: 'image' | 'video';
                  outputs: { variant: string; putUrl: string; contentType: string }[] }): Promise<void>
    status(ref: string): Promise<'unknown' | 'working' | 'done' | 'failed'>
  }
  ```

  Drivers: `http` (the container above, default), `local` (spawns ffmpeg on the dev machine), `fake` (tests, `ADAPTER_MODE=fake`). A future driver for a managed transcoding API plugs in with one file.
- **No secrets and no database inside the processor.** It downloads from a presigned GET, uploads to presigned PUTs, and reports through the signed callback (`15` §2.1). It only knows `MEDIA_PROCESSOR_SECRET` and the callback URL.
- **Scales to zero** on Cloud Run, Lambda, Fly Machines or Azure Container Apps. Concurrency 1 per instance (ffmpeg uses all cores), max instances from config.
- **Output rules** are unchanged: images → JPEG (EXIF stripped); video → H.264/AAC, ≤ 1080p, `+faststart`.

## 6. State that used to live in memory

| Concern | Before (single VPS) | Now |
|---|---|---|
| Job queue, schedules | pg-boss | `jobs` + `job_schedules` tables (`15`) |
| Worker heartbeat | `worker_heartbeat` | `system_heartbeat('tick')` |
| Rate limits (app) | In-memory fixed window | `rate_limit_buckets` in Postgres (`16` §4) |
| Rate limits (better-auth) | Memory | better-auth `rateLimit.storage: 'database'` |
| Redirect / abuse protection | In-memory + Cloudflare | Cloudflare rate limiting rules on `SHORT_DOMAIN` and `/api/webhooks/**` |
| Click buffer | Batched in memory, flushed on SIGTERM | One insert per click via `waitUntil` (`../ARCHITECTURE.md` §10.1) |
| Settings cache | 60 s per process | Unchanged: 60 s per instance, best effort. Kill switches take effect within 60 s on every instance |
| Entitlements cache | 60 s per process, cleared on change | Cache key includes `workspaces.entitlements_version`, which `invalidateEntitlements()` bumps. The workspace row is loaded by every gatekeeper, so a change is seen by **every instance on the next request** |
| Short link cache | LRU 60 s, cleared on edit | LRU 30 s per instance. Disabling a link takes effect within 30 s everywhere |
| `lastSeenAt` debounce | In-memory map | Conditional `UPDATE … WHERE last_seen_at < now() - interval '15 minutes'`, fired with `waitUntil` |

**Database driver.** `server/core/db/client.ts` exports one `db` built from `DB_DRIVER`:
- `pg` (default): `drizzle-orm/node-postgres` with a small `Pool` on the pooled Neon URL. Local Postgres in dev.
- `neon-ws` (tier-2 targets only): `drizzle-orm/neon-serverless` (WebSocket `Pool`, transactions supported). Same Drizzle query API, so core code doesn't change.

## 7. Domains and routing without Caddy

- **TLS** is handled by Cloudflare at the edge and by the host for the origin (Cloudflare SSL mode "Full (strict)").
- **Short domain rewrite** is a Cloudflare **URL Rewrite (Transform) Rule** on `SHORT_DOMAIN`. It works the same for every origin host:
  - `/@{handle}` → `/bio/{handle}`
  - `/{slug}` (one segment matching the slug pattern) → `/r/{slug}`
  - `/_nuxt/*`, `/favicon.ico`, `/robots.txt` pass through unchanged.
- **Guard**: `server/middleware/00.host-guard.ts` answers `404` on `SHORT_DOMAIN` for any path other than `/r/**`, `/bio/**` and static assets, so the console and API are never served on the short domain.
- **Fallback** if Cloudflare is not in front (local dev, a preview URL): the same middleware rewrites by `Host`. Whether that rewrite works on each preset is checked in the M1 spike; the Cloudflare rule is the production path.
- **Security headers** (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) come from Nitro `routeRules.headers`, not from a proxy. The Etalase routes get the strict CSP.
- **Client IP**: `clientIp(event)` reads `CF-Connecting-IP` first (Cloudflare is always the first hop in production), then the host's forwarded header.

## 8. Previews and environments

| Environment | Database | Functions | Tick |
|---|---|---|---|
| Local | Docker `postgres:17` | `nuxt dev` | `npm run tick:dev` |
| Preview (per PR) | Neon branch from staging | Host preview deploy | **Off** by default (no cron on previews). Tests run jobs via `/api/internal/jobs/run` |
| Staging | Neon `staging` branch | Reference host | Every minute |
| Production | Neon `main` | Production host | Every minute + backup pinger |

Preview deploys must never receive production secrets, and Meta / hub webhooks point only at staging and production.

## 9. Switching hosts (runbook)

1. Add `deploy/<target>/` config (preset, region, `maxDuration`, cron entry).
2. Set env vars in the new host; deploy; attach domains as unproxied hostnames for testing.
3. Point the tick at the new deployment (both ticks running at once is safe).
4. Flip the Cloudflare DNS origin for `socialz.id` and `SHORT_DOMAIN`.
5. Remove the old host's cron entry, then the old deployment.

No data moves: Postgres, R2 and the media processor stay where they are. OAuth redirect URIs and webhook URLs use the public domain, so Meta, Google and the Payment Hub need no change.
