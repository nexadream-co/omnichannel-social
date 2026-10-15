# Roadmap — Socialz.id v1 (~14 weeks)

Detailed build phases: [`blueprint/17-implementation-plan.md`](blueprint/17-implementation-plan.md).

The critical path is Meta: **Business Verification → App Review → Access Verification**. Start it on day 1, in parallel with development.

| # | Weeks | Scope | Done when |
|---|---|---|---|
| M0 | 1 (parallel, non-code) | Meta Business Verification; Meta app with the Instagram Login, Threads and FB Login for Business use cases; Nexadream Payment Hub: request the platform API key + order prefix, register webhook/redirect URLs; Google OAuth consent screen; PSE registration; domains on Cloudflare; pick hosting accounts (function host + container host) | All submitted |
| M1 | 1–2 | Node 24 via fnm, repo scaffold, Docker dev (Postgres 17 + Mailpit), CI (lint, tests, migrate, deploy), portability spike + pick the staging host, core schema, better-auth (email + Google), i18n id/en, Nuxt UI app shell, job table + per-minute tick, staging on serverless | Sign up, verify and log in work on staging; tick heartbeat is green; the same build passes on the `node-server` preset |
| M2 | 3–4 | Token encryption, connecting IG, Threads and FB through adapters, R2 uploads, automatic media fixing (media processor container), data deletion and deauthorize callbacks, privacy and terms pages, onboarding checklist | Testers connect all 3 channels; an iPhone video becomes a valid Reel with no user action |
| M3 | 5–6 | Composer (simple by default, "Opsi lanjutan" for advanced options), calendar, posts list, publish pipeline, quota, retries, reconciliation, notifications, caption templates | Every format publishes automatically; a 50-post soak plus kill-mid-step tests produce zero duplicates or lost posts. **Submit App Review batch 1** |
| M4 | 7 | Instagram comment webhooks, auto-reply rules (with ready-made templates), private + public replies, activity log | A comment produces a DM in under 10s; replayed webhooks never double-send. **Submit App Review batch 2** |
| M5 | 8–9 | Product links (paste-a-link autofill), short domain, click tracking, simple analytics, etalase editor + public page | Paste a Shopee URL and get product card + short link + etalase entry in one step; redirect p95 under 20ms |
| M6 | 10–11 | Plans (Gratis + Kreator), entitlements, Nexadream hub checkout (monthly/yearly), webhook + reconciliation, renewal reminders, downgrade enforcement, back-office billing screens | The real-hub end-to-end scenarios in `blueprint/17` Phase 11 pass |
| M7 | 12–13 | Insights (+24h), backup/PITR check, security review, **usability test with 5 first-time creators**, closed beta with ~20 creators | A newcomer finishes onboarding in under 5 minutes without help; under 1% failures caused by us |
| M8 | 14 | App goes Live after review and Access Verification, production keys, Indonesian landing page | An outside user with no app role connects IG and publishes |

## After v1 (backlog, ordered)
1. TikTok adapter (start the audit during M3)
2. Recurring billing, only if a payment driver with mandates is added
3. Pro plan
4. Shopee Affiliate / Involve Asia commission sync
5. YouTube adapter, then X (paid API)
6. Agency features: teams, client workspaces, approvals
