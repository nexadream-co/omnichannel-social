# 15 — Background Jobs (Postgres job table + HTTP tick)

Socialz.id runs on **serverless functions on any host** (`19`), so there is no always-on worker process. Background work is stored as rows in a Postgres `jobs` table and executed by **ordinary HTTP invocations**:

- a **tick**: any cron source calls `/api/internal/tick` once a minute; and
- a **kick**: right after a request commits urgent work, it starts running it in the same invocation via `event.waitUntil()`.

The domain still needs minute-precise scheduled publishing, container status polling, webhook processing, retries and per-account rate caps. All of these are expressed as job rows with a `run_at`. There is no pg-boss, no queue vendor and no long-lived consumer. **Postgres stays the only stateful backend.**

## 1. Design

```
any HTTP invocation                         tick invocation (/api/internal/tick, every minute)
───────────────────                         ──────────────────────────────────────────────────
business write + enqueue() in one tx         1. auth: Authorization: Bearer $CRON_SECRET
after commit: event.waitUntil(kick(ids))     2. heartbeat: system_heartbeat('tick') = now()
  → runs those jobs now, inside the          3. fire due schedules (job_schedules slot claim → enqueue)
    remaining time budget                    4. runDue(): claim due jobs SKIP LOCKED, run within budget
                                             5. backlog left? fan out ≤ JOBS_FANOUT_MAX signed calls
                                                to /api/internal/jobs/run
```

Rules (MUST):

1. **Enqueue in the same transaction as the write that justifies it.** `enqueue(tx, queue, payload, opts)` is a plain `INSERT` into `jobs`, so a post that is saved as scheduled always has its job, and a webhook row that is stored always has its processing job. This is simpler than pg-boss: no second client, no `db` option.
2. **A job is a trigger, not the state.** Handlers load the current DB row, check that it still needs work (status, version, timestamps), and exit quietly if not. Duplicate or stale jobs are therefore harmless.
3. **Every step is idempotent.** A handler that runs twice changes nothing the second time (unique keys, conditional updates, `ON CONFLICT DO NOTHING`, claim-by-update).
4. **Assume the invocation can die at any line.** Serverless hosts freeze or kill an invocation at its time limit, on deploy, or at random. There is no `SIGTERM` hook to rely on. A claimed job carries a **lease** (`lease_until`); when the lease expires, any later tick reclaims it. Long steps persist their progress (`post_targets.step`) **before** the external call, so a re-run resumes instead of repeating.
5. **Per-item try/catch** in any handler that loops (reminders, reconciliation, purges). One bad item is logged and skipped; it never stops the rest.
6. **Network calls stay outside DB transactions** (Meta, hub, Resend, R2, media processor).
7. **Every invocation has a time budget** (`JOBS_TIME_BUDGET_MS`, default 45 000), set below the host's function duration limit. The runner stops claiming new jobs when less than the queue's `expectedMs` remains. A handler that needs more time must split itself into steps (re-enqueue with `runAt`), never exceed the budget.
8. **Tick delivery is best effort.** Host crons can skip a run, run it twice, or run two at once (Vercel documents all three). So a tick never processes "this minute's" work. It processes **everything due** (`run_at <= now()`), claims with `FOR UPDATE SKIP LOCKED`, and schedules use slot claims (§1.2). A missed tick only delays work by one minute; a duplicate tick finds nothing left to claim.
9. **No in-process timers.** `setInterval` / `setTimeout` loops do not exist in production code. Waiting means a new job row with a later `run_at`, or a short `await sleep()` inside the budget (polling, §2).
10. **Only the pooled database URL at runtime.** The job runner uses the same `db` client as every request (`01` §6). It uses no session features: no `LISTEN/NOTIFY`, no session advisory locks, no session `SET` (only `SET LOCAL` inside a transaction).

### 1.1 Tables

Defined in `server/core/db/schema/jobs.ts`. These are system tables, not workspace-owned. `workspace_id` is a nullable copy of the payload's workspace, for admin filtering only.

| Table | Columns and constraints |
|---|---|
| `jobs` | `id` uuidv7, `queue` text, `payload` jsonb (ids only, never tokens or secrets), `workspace_id` NULL, `status` (`queued` / `running` / `done` / `dead` / `cancelled`), `run_at` timestamptz, `attempts` int, `max_attempts` int, `lease_until` NULL, `singleton_key` NULL, `last_error` text NULL, `created_at`, `started_at` NULL, `finished_at` NULL. **Partial UNIQUE(`queue`, `singleton_key`) WHERE status IN ('queued','running')**. Index(`status`, `run_at`). Index(`queue`, `status`) |
| `job_schedules` | `name` PK, `cron` text, `tz` text, `last_slot` timestamptz NULL, `last_job_id` NULL, `enabled` boolean. Seeded from `server/core/jobs/schedules.ts` (reference data: migration **and** seed) |
| `system_heartbeat` | `name` PK (`tick`, `media_processor`), `beat_at`, `info` jsonb (last tick summary) |

Retention (`maintenance.purge`): `done` and `cancelled` jobs after 7 days, `dead` jobs after 30 days.

### 1.2 Schedules fire once per slot

The host cron is **one entry**: `* * * * *` (UTC) → `/api/internal/tick`. Our platform schedules (§3) live in `job_schedules`, in `Asia/Jakarta` time, so they never depend on a host's cron syntax, its UTC-only rule, or its per-plan cron limits.

On each tick, for each enabled schedule:

1. Compute `slot` = the latest cron time `<= now()` in the schedule's timezone (`cron-parser`).
2. Claim it: `UPDATE job_schedules SET last_slot = $slot WHERE name = $name AND (last_slot IS NULL OR last_slot < $slot) RETURNING name`.
3. If a row came back, `enqueue(tx, name, { slot }, { singletonKey: slot.toISOString() })` **in the same transaction** as the claim.

Two overlapping ticks race on step 2; only one wins. A tick that was missed simply fires the latest slot on the next tick (catch-up runs **once**, not once per missed slot; every platform job processes "all due" items, so one run catches up). Schedules are upserted from code at deploy (seed / migration), never registered at runtime. A schedule ships `enabled = false` until its handler exists; the migration of the milestone that adds the handler enables it (M1: only `maintenance.purge`).

### 1.3 Claiming and running (`server/core/jobs/runner.ts`)

```ts
runDue({ budgetMs, queues?, maxJobs? }): Promise<RunSummary>
kick(jobIds: string[], budgetMs?): Promise<RunSummary>   // after commit, via event.waitUntil()
```

Claim query (one round trip per batch):

```sql
UPDATE jobs SET status = 'running', attempts = attempts + 1, started_at = now(),
       lease_until = now() + make_interval(secs => $lease)
WHERE id IN (
  SELECT id FROM jobs
  WHERE (status = 'queued' AND run_at <= now())
     OR (status = 'running' AND lease_until < now())      -- reclaim a dead invocation's job
  ORDER BY run_at
  LIMIT $batch
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

- Jobs in one invocation run with a per-queue concurrency (`p-limit`), from the queue table (§2).
- **Success:** `status = 'done'`, `finished_at = now()`, `lease_until = NULL`.
- **Transient error** (the adapter classifies it, `../ARCHITECTURE.md` §8.4) and `attempts < max_attempts`: `status = 'queued'`, `run_at = now() + backoff(attempts)` (exponential with jitter: 30 s, 2 min, 8 min, 30 min).
- **Defer** (rate limit, quota, kill switch): the handler returns `{ deferUntil }`, which requeues **without** counting an attempt (`attempts = attempts - 1`).
- **Permanent error or attempts exhausted:** `status = 'dead'`, `last_error` set. Dead jobs show in `/admin/system/jobs` with a retry button (`09`). There is no separate dead-letter queue.
- **Cross-instance concurrency caps** that matter (per-account DM rate, publish quota) are enforced by **counters in Postgres** inside the handler, not by the runner. The runner's per-queue concurrency only protects one invocation.

### 1.4 Kick: run urgent work now

Webhooks, auto-reply DMs, "Posting sekarang" (publish now) and email cannot wait for the next tick. The handler that enqueued them calls:

```ts
// server/api/webhooks/meta.post.ts (shape)
const ids = await storeMetaWebhook(ctx, raw)          // insert rows + enqueue in one tx
event.waitUntil(kick(ids))                            // runs after the 200 is sent
return 'OK'
```

- `event.waitUntil` is h3/Nitro's portable wrapper: the host's `waitUntil` on Vercel, Netlify and Cloudflare; a tracked promise on `node-server`. On a host without it, the job simply waits for the next tick (≤ 60 s). Correctness never depends on the kick.
- `kick()` claims **only the given ids** with the same claim query (`AND id = ANY($ids)`), so it can never steal a tick's work or run a job twice.
- `server/core/**` receives the kick as a function (`ctx.defer(promise)`), never the event. Scripts and tests pass a `defer` that awaits.

### 1.5 Fan-out under backlog

If `runDue()` stops with due jobs still waiting, the tick makes up to `JOBS_FANOUT_MAX` (default 4) parallel `POST {{SITE_URL}}/api/internal/jobs/run` calls, signed with `INTERNAL_SIGNING_SECRET` (HMAC over timestamp + body, ±5 min skew). Each call is a fresh invocation with its own budget running `runDue()`. SKIP LOCKED keeps them from colliding. Fan-out is fire-and-forget (`waitUntil`), with a 2 s connect timeout. Set `JOBS_FANOUT_MAX=0` on hosts where self-invocation is unwanted.

### 1.6 Health

- The tick upserts `system_heartbeat('tick')` with a summary `{ claimed, done, failed, deferred, dead, backlog, durationMs }`.
- `/healthz` reports unhealthy when the last tick is older than 3 minutes, or when the oldest due `queued` job is older than 5 minutes. The uptime monitor alerts on it.
- `/healthz` also reports the media processor's last callback age (`system_heartbeat('media_processor')`), informational only.

### 1.7 Queue options

Declared once in `server/core/jobs/queues.ts`:

| Option | Default | Notes |
|---|---|---|
| `maxAttempts` | 5 | transient errors only |
| `leaseSeconds` | 120 | must exceed the handler's worst case inside one invocation |
| `expectedMs` | 10 000 | the runner won't start a job with less budget left than this |
| `concurrency` | 5 | per invocation |
| `singletonKey` | per queue | e.g. `publish.target` uses the target id |

## 2. Domain queues

Full behaviour in `../ARCHITECTURE.md` §8–§10. Summary:

| Queue | Trigger | Concurrency | Behaviour |
|---|---|---|---|
| `publish.target` | `runAt = scheduled_at`, `singletonKey = targetId`; kick on "Posting sekarang" | 10 | Lock row `FOR UPDATE SKIP LOCKED`, drop stale jobs, quota check, `prepare` |
| `publish.poll` | re-enqueue | 10 | Container status: polls inline at 5 s and 10 s inside the budget, then re-enqueues at +30 s, +60 s … up to 20 min total |
| `publish.reconcile` | on `publish_unknown` | 5 | `findRecent` + caption-hash match; never blind retry |
| `media.process` | kick after upload completes | 5 | Already-valid JPEG/PNG → `ready` inline. Everything else → `mediaProcessor.submit()` and return (§2.1) |
| `media.watchdog` | `runAt = submit + 35 min` | 5 | If the asset is still `processing`, ask `mediaProcessor.status()`; resubmit once, then `failed` with a plain reason |
| `webhook.meta` | kick after webhook insert | 10 | Route by field (`comments`, deauthorize) |
| `dm.send` | kick after rule match | 5 | Per-account hourly cap (Postgres counter); over cap → `deferUntil`; respects the `channels.autoReply.enabled` kill switch |
| `token.refresh` | schedule hourly | 1 | Enqueue `token.refresh.one` (singleton per account) for tokens expiring within 10 days |
| `insights.fetch` | `runAt` after publish (+24 h in v1) | 5 | Post metrics; account totals daily |
| `links.unfurl` | kick after a product URL is pasted | 3 | `safe-fetch` the marketplace page, store title, price and image |
| `email.send` | on demand (seam, `11` §5) | 5 | Resend; failures logged, never thrown into the caller |

`clicks.rollup` and `clicks.partitions` are not v1 (`../ARCHITECTURE.md` §19).

Publishing and auto-reply also check the platform kill switches (`channels.publishing.paused`, `channels.autoReply.enabled` settings). When paused, jobs defer by 10 minutes instead of failing, and targets show "Dijeda sementara oleh tim Socialz.id".

### 2.1 Media processing is not a function job

Video transcoding can take minutes, needs the `ffmpeg` binary, and exceeds function limits on most hosts. It runs in the **media processor**, a separate container behind the `MediaProcessor` adapter (`../ARCHITECTURE.md` §8.5, `19` §5):

1. `media.process` sends `submit({ assetId, sourceUrl, outputs })` where `sourceUrl` is a presigned GET and each output carries a presigned PUT. The processor holds **no storage credentials and no database access**.
2. The processor answers `202` at once, works, uploads the outputs, then calls `POST /api/internal/media/callback` (HMAC-signed with `MEDIA_PROCESSOR_SECRET`) with the probe data or a failure code.
3. The callback validates the signature, re-reads the asset row, applies the result with a conditional update (`WHERE status = 'processing' AND processor_ref = $ref`), and returns 200. A duplicate callback changes nothing.
4. `media.watchdog` covers a lost callback.

## 3. Platform schedules

All times are `Asia/Jakarta` (WIB). Every one of them is an ordinary queue whose job is created by the slot claim (§1.2). Each step below runs within the budget; a step that can't finish (large batches) stores its cursor in the job payload and re-enqueues itself with `runAt = now()`, so long work spans several invocations.

### 3.1 `billing.daily` — 00:05 every day

Steps, in order, each in its own try/catch:

1. **Trials expired**: `status = trialing AND trial_ends_at <= now` → `transitionSubscription('trial_expired', force)` (→ Gratis plan + `enforceWorkspaceLimits()`).
2. **Grace expired**: `status = past_due AND grace_ends_at <= now` → `grace_expired`.
3. **Cancellations ended**: `status = cancelled AND current_period_end <= now` → `grace_expired` (same downgrade path).
4. **Active periods ended without payment** (manual renewal model): `status = active AND current_period_end <= now` → `payment_failed` (→ `past_due` with `grace_ends_at`), only if no `paid` payment extended it. This is how an unpaid manual renewal enters grace.
5. **Trial reminders**: `trialing` with `trial_ends_at` within `billing.trialReminderDays` → `trial_ending_soon` to the owner, **at most once per local day per workspace** (skip if a notification with that template key exists since the start of the local day).
6. **Payment reconciliation**: `reconcilePendingPayments()` (pending payments of the active gateway created in the last 48 h, max 200, re-read from the hub). Runs late so a slow gateway can't delay the steps above.
7. **Audit purge**: `purgeExpiredAudits({ force: true })` in batches of 5 000 via an id subquery until a batch comes back short (max 20 passes, continued in a follow-up job if the budget runs out).

Returns (and logs) `{ trialsExpired, gracesExpired, cancellationsClosed, periodsLapsed, remindersSent, paymentsChecked, paymentsUpdated, auditRowsPurged }`.

### 3.2 `billing.renewal-reminders` — 07:00 every day

The Nexadream Payment Hub has no recurring billing, so every renewal is a checkout the owner starts. This job reminds them.

- For each `active` (or `cancelled`-but-not-ended is skipped) subscription whose `current_period_end` falls exactly N local days from today, for each N in setting `billing.renewalReminderDays` (default `7,3,1`), send `renewal_reminder` (bell + email) with `{ planName, periodEnd, daysLeft, amount, billingUrl }`.
- **Once per workspace per day-offset**: skip if a `renewal_reminder` notification with the same `daysLeft` exists for this workspace since the start of the local day.
- No reminder when a paid payment already extended the period beyond the window.

### 3.3 `engagement.inactivity` — 07:00 every day

- Owners of active workspaces whose last activity (`last_seen_at`, else `last_login_at`) fell on the local day exactly `INACTIVITY_EMAIL_DAYS = 10` ago → email `inactivity_winback` (with a tip: "Jadwalkan 3 postingan untuk minggu ini dalam 5 menit").
- Email only; Socialz.id has no push.
- **Stateless per person**: nothing records who was reminded. The slot claim guarantees one run per day.

### 3.4 `token.refresh` — every hour

See §2. Accounts that fail to refresh become `needs_reauth`; the owner gets `account_reconnect_needed` (bell + email) at most once per account per 24 h.

### 3.5 `maintenance.purge` — 03:00 every day

- `webhook_events` (Meta inbox) older than 14 days; `payment_webhook_events` older than 180 days.
- `jobs`: `done` / `cancelled` older than 7 days, `dead` older than 30 days.
- `rate_limit_buckets` whose window ended (`16` §4).
- `dm_events.comment_text` older than 30 days set to null.
- Expired sessions (both audiences), expired verifications, expired invitations.
- Daily IP-hash salts older than 2 days.
- Each step batched (5 000 rows per pass), per-step try/catch.

### 3.6 Scheduling table (seeded into `job_schedules`)

```
billing.daily               5 0 * * *     Asia/Jakarta
billing.renewal-reminders   0 7 * * *     Asia/Jakarta
engagement.inactivity       0 7 * * *     Asia/Jakarta
maintenance.purge           0 3 * * *     Asia/Jakarta
token.refresh               0 * * * *     Asia/Jakarta
insights.daily              30 2 * * *    Asia/Jakarta   (account totals)
```

## 4. Internal endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET` / `POST /api/internal/tick` | `Authorization: Bearer $CRON_SECRET` (constant-time compare) | §1. Accepts both methods because host crons differ (Vercel sends `GET`) |
| `POST /api/internal/jobs/run` | HMAC `INTERNAL_SIGNING_SECRET` | Fan-out target (§1.5) |
| `POST /api/internal/media/callback` | HMAC `MEDIA_PROCESSOR_SECRET` | §2.1 |

- They sit outside the CSRF and session middleware, answer `404` (not `401`) to an unauthenticated caller, and are excluded from caching and from the short domain.
- The handlers are thin: verify, build a system context, call `runTick(ctx)` / `runDue(ctx)` / `applyMediaResult(ctx, body)` from `server/core/jobs`.

## 5. Running a job by hand

Staff can trigger a platform schedule from `/admin/system/jobs` (`settings.write`): it enqueues a one-off job of that queue (`singletonKey = 'manual:' + minute`) and kicks it. Because every step is idempotent, an extra run is safe. The same screen shows queue depth, oldest due job per queue, dead jobs with their error and a retry button, the last tick age and summary, and each schedule's `last_slot` (`09`).

## 6. Local development and tests

- `npm run dev` starts Nuxt. `npm run tick:dev` (`scripts/dev-tick.ts`) calls `/api/internal/tick` every 15 s with the dev `CRON_SECRET`, exactly like a host cron. Without it, kicks still run immediately; only scheduled work waits.
- Tests call `runDue()` / `runTick()` directly with a fake clock and a `defer` that awaits.
- Chaos tests (`../ARCHITECTURE.md` §15) abort a handler mid-step and let the lease expire, deliver the same tick twice concurrently, and replay callbacks.

## 7. Scaling notes

- Throughput grows with fan-out and the tick frequency, not with a worker count. One tick + 4 fan-outs at a 45 s budget handle a few thousand short jobs per minute, far above v1 needs.
- The tick queries the database every minute, so Neon compute does not scale to zero (same cost as the old polling worker; `../PLATFORM-CONSTRAINTS.md` → Neon).
- If minute precision or volume ever needs more, the trigger can be replaced (for example a managed queue that calls `/api/internal/jobs/run`) without touching handlers: the `jobs` table and `runDue()` stay the contract.
