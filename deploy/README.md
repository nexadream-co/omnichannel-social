# Deploying Socialz.id

The app is one Nitro build that runs on any host (docs/blueprint/19). Pick a target below; every target
provides the same six things:

1. `NITRO_PRESET=<preset> npm run build` (the build never migrates).
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
| Vercel (Pro) | `vercel` | `vercel/` | Vercel Cron (sends `Bearer $CRON_SECRET` itself) | External container host |

Host config files stay in their folder and are copied (or linked in the host's project settings) at deploy time, e.g. `cp deploy/vercel/vercel.json .` in the Vercel build. App code never imports them.

## Release order (any target)

```sh
npm ci && npm run lint && npm run typecheck && npm test
DATABASE_URL_DIRECT=… npm run db:migrate      # CI only; functions never get the direct URL
# deploy with the target's CLI or git integration
curl -fsS https://<site>/healthz              # 200 once the first tick has run
```

First deploy only: `npm run db:seed` once against the new database (creates the superadmin from
`SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`, plans, templates, legal drafts). Never re-run it
on a live environment: reference data ships inside migrations.

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
