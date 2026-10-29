# Deploying Socialz.id

The app is one Nitro build that runs on any host (docs/blueprint/19). Pick a target below; every target
provides the same six things:

1. `NITRO_PRESET=<preset> npm run build` (builds, then migrates; seeds a fresh database once).
2. Environment variables (see `.env.example`); secrets in the host's secret store.
3. Two domains on the app: the site (`socialz.id`) and the short domain, both behind Cloudflare.
4. **One cron entry**: every minute `GET https://<site>/api/internal/tick` with `Authorization: Bearer $CRON_SECRET`, plus a second external pinger as backup (ticks are idempotent).
5. `maxDuration` of at least 60 s for `/api/internal/**`.
6. The media processor container (`services/media-processor/Dockerfile`) on any container host, reachable at `MEDIA_PROCESSOR_URL`.

| Target | Preset | Folder | Tick | Media processor |
|---|---|---|---|---|
| Any VPS / Docker host | `node-server` | `docker/` | `tick` service in compose + external pinger | Same compose |
| Google Cloud Run | `node-server` (container) | `cloudrun/` | Cloud Scheduler | Cloud Run service (scales to zero) |
| AWS Lambda | `aws-lambda` | `aws-lambda/` | EventBridge Scheduler → API destination | Lambda container image or Fargate |
| Vercel (Pro) | `vercel` | `/vercel.json` (repo root) | Vercel Cron (sends `Bearer $CRON_SECRET` itself) | External container host |

Host config files stay in their folder and are copied (or linked in the host's project settings) at deploy time. The exception is Vercel, which only reads `vercel.json` from the repo root: it holds the build command, region, `maxDuration`, the per-minute cron and branch tracking (only `main` and `staging` deploy; every other branch is ignored), so the Vercel dashboard needs no extra setup. Vercel Cron only calls the **production** deployment, so a `staging` branch deployed as a preview of the same project gets no tick: give staging its own Vercel project (production branch `staging`) or an external pinger. App code never imports these files.

## Release order (any target)

```sh
npm ci && npm run lint && npm run typecheck && npm test
# Vercel / Lambda: deploy with the target's CLI or git integration; its `npm run build` migrates
# Docker / Cloud Run: the image builds with SKIP_DB_DEPLOY=1, so run this first:
DATABASE_URL_DIRECT=… npm run db:deploy        # migrations + seed on a fresh database
curl -fsS https://<site>/healthz              # 200 once the first tick has run
```

`npm run build` runs `nuxt build`, then `npm run db:deploy`: migrations on `DATABASE_URL_DIRECT` (or `DATABASE_URL`), and the seed once when the database has no staff user yet (a fresh environment). A live environment is never re-seeded. `SKIP_DB_DEPLOY=1` builds without a database. Give the build `DATABASE_URL_DIRECT` (and, in production, `SEED_SUPERADMIN_PASSWORD`); the functions never use the direct URL.

## Cloudflare (all targets)

- SSL mode **Full (strict)**; both domains proxied.
- **Transform rule** on the short domain (URL rewrite, path only):
  - `starts_with(http.request.uri.path, "/@")` → dynamic `concat("/bio/", substring(http.request.uri.path, 2))`
  - one path segment matching `^/[0-9A-Za-z_-]{3,32}$` → dynamic `concat("/r", http.request.uri.path)`
  - `/_nuxt/*`, `/favicon.*`, `/robots.txt` pass through.
- **Rate limiting rules**: the short domain (per IP) and `/api/webhooks/*`.
- Origin host check: `server/middleware/00.host-guard.ts` returns 404 for anything else on the short domain.

## After the first deploy (back-office)

Sign in at `/admin`, change the superadmin password, then: Pengaturan (company, email/Resend key → "Kirim email uji",
billing, privacy, app, channels) → Payment gateway (hub key, base URL, order prefix → activate) → Paket (prices) →
Halaman (review the legal drafts with counsel; privacy and terms must be live before Meta App Review) → Staf.

Staging can run in **test mode** until the hub key exists: the seed activates the payment simulator in any non-production environment (`docs/blueprint/08` §11). Production never offers it.

Register with the Payment Hub admin: webhook `https://<site>/api/webhooks/payments/nexadream_hub`,
finish/error/pending redirects `https://<site>/app/billing?status=success|failed|pending`.

Register with Meta: webhook `https://<site>/api/webhooks/meta` (verify token = `META_WEBHOOK_VERIFY_TOKEN`,
fields: `comments` for Instagram), data deletion `https://<site>/api/meta/data-deletion`, deauthorize
`https://<site>/api/meta/deauthorize`, OAuth redirect `https://<site>/api/app/channels/<platform>/callback`.
