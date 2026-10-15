# 16 — Cross-cutting Concerns

## 1. Storage & uploads

Adapter layer, like payments:

```
server/core/services/storage/
  types.ts      StorageDriver contract
  index.ts      facade: uploadObject, deleteObject, presignPut, publicUrl, sniffImageType, assertUploadAllowed, stripExif
  r2.ts         Cloudflare R2 driver (S3 API signed with aws4fetch)
  fake.ts       in-memory driver for tests
```

In development the R2 driver talks to an S3-compatible mock in `docker/compose.dev.yml` (`adobe/s3mock`, via `R2_ENDPOINT`), so uploads work without Cloudflare credentials. (MinIO no longer publishes public Docker images.)

```ts
export interface StorageDriver {
  readonly provider: string
  upload(input: { key: string, body: Buffer, contentType: string, cacheControl?: string }): Promise<{ key: string, url: string }>
  delete(key: string): Promise<void>
  presignPut(input: { key: string, contentType: string, contentLength: number, ttlSeconds: number }): Promise<string>
  publicUrl(key: string): string        // https://{{MEDIA_DOMAIN}}/<key>
}
```

There are **two upload paths**:

### 1.1 Post media (images and videos for publishing) — presigned PUT

- `POST /api/app/media/presign { filename, mime, bytes }`:
  - checks the mime against the allowed list (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `video/mp4`, `video/quicktime`) and the size against the largest channel limit (300 MB) and the workspace's storage quota;
  - creates a `media_assets` row (`status: 'uploading'`) with an **unguessable key** `w/<workspaceId>/<uuidv7>/<random>.<ext>`;
  - returns `{ mediaId, uploadUrl }` (TTL 15 min).
- The browser PUTs the file straight to R2 (CORS on the bucket allows `PUT` from `{{SITE_URL}}` only).
- `POST /api/app/media/:id/complete` → enqueue and kick `media.process`. Already-valid JPEG/PNG files become `ready` inline (magic bytes + dimensions); everything else goes to the media processor (ffprobe, convert, compress, write variants through presigned PUTs), which reports back through a signed callback that sets `ready` or `failed` with a plain reason (`../ARCHITECTURE.md` §8.5). **The server never fetches a user-supplied URL** (no SSRF).
- Meta fetches the final media from `{{MEDIA_DOMAIN}}` by URL, so these objects are public but unlisted.

### 1.2 Small images — server upload

Used for creator avatars, the Etalase avatar, product images uploaded by hand, staff avatars and CMS images.

Rules (`shared/utils/uploads.ts` shared by browser + server; the server is the authority):
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. **No SVG** (can carry script).
- Ceiling 4 MB (below every serverless host's request body limit, `19` §2); avatars 50 KB (the browser downsizes to ≤ 512 px and ~48 KB before sending).
- **Never trust the client**: the type is **sniffed from magic bytes** (JPEG `FF D8 FF`, PNG signature, `GIF87a/89a`, `RIFF….WEBP`); the extension comes from the sniffed type; the stored filename is generated (`<timestamp>-<random>.<ext>`). The multipart filename never reaches the bucket key.
- JPEG EXIF/APPn segments are stripped (removes GPS from phone photos).
- `handleUpload(ctx, prefix, { maxBytes })` → `{ key, url, size, contentType }`. Prefixes: `staff/` (staff avatars, CMS), `w/<workspaceId>/img/` (creator files).
- Endpoints: `POST /api/app/uploads`, `POST /api/admin/uploads` (multipart field `file`). The client never talks to a storage SDK.

Product images fetched automatically from a pasted marketplace URL ("paste-a-link magic") are downloaded by the `links.unfurl` job through `safe-fetch` (`../ARCHITECTURE.md` §11) and stored through the same sniff + strip pipeline.

## 2. Audit log

`server/core/audit.ts`:

```ts
recordAudit(ctx | null, {
  audience: 'creator' | 'staff',
  action: string,                 // English slug, e.g. 'workspace.suspend'
  actorId?, actorName?, impersonatorId?, workspaceId?,
  targetType?, targetId?, metadata?, ip?, userAgent?
})
```

- **Never throws**: an audit write must not fail the action it describes.
- `actorId` is a staff id for staff actions; for creator actors the id is stored in `metadata.userId` (deleting a user never blocks the trail).
- IP and user agent in columns; for `auth.*` and `workspace.register` a readable device description and IP also go into `metadata`, so the creator's own activity log can show "where was this sign-in from".
- **Retention**: `privacy.auditRetentionDays` (default 90; nonsense values → default). Purge runs in the daily `billing.daily` job (`15` §3.1) in batches of 5 000 via an id subquery (no long-locking unbounded DELETE).
- Labels: `AUDIT_ACTION_LABELS` (action slug → i18n key), `AUDIT_METADATA_LABELS`, value maps. Never render slugs.

Action vocabulary (extend for new features):

```
auth.sign_in  auth.sign_in_failed  workspace.register
workspace.suspend  workspace.reinstate  workspace.delete  workspace.delete_request
workspace.impersonate_start  workspace.impersonate_stop  staff.impersonate_start  staff.impersonate_stop
subscription.plan_change  subscription.downgrade  payment.cancel  payment.webhook_replay
role.update  permission.update
team.invite  team.invite_revoke  team.invite_accept  team.role_change  team.deactivate  team.reactivate
social_account.connect  social_account.disconnect  social_account.reauth_needed
post.publish_failed  post.retry  post.cancel
auto_reply.rule_activate  auto_reply.rule_pause  auto_reply.kill_switch
link.disable  bio.publish  bio.unpublish
meta.data_deletion  meta.deauthorize
settings.update  account.export
```

**Creator-visible activity log** (`/app/activity`, `GET /api/app/activity`, ability `activity.read` + plan feature `activityLog`):
- Rows with `workspaceId` = this workspace.
- Staff actions shown only from an allow-list (impersonation start/stop, suspend, reinstate, plan change, publishing/auto-reply pause) with the actor rendered as "Tim Socialz.id".
- Internal metadata keys (`userId`, `actorId`, `impersonatorId`) stripped.
- Window = `min(plan activityLogRetentionDays (−1 → horizon), privacy.auditRetentionDays)`; the response says when it was clamped.
- `GET /api/app/activity/actions` lists the action filter options.

## 3. Crypto helpers — `server/core/crypto.ts`

**One helper for every secret at rest**: settings secrets, payment gateway keys, and **social account tokens**.

```ts
encrypt(plain, aad?)       // AES-256-GCM → 'enc:v1:<iv b64url>:<tag b64url>:<ct b64url>'; 12-byte IV
decrypt(value, aad?)       // passes non-prefixed values through; '' on failure (rotated key / wrong AAD)
isEncrypted(value)
sha256(value)              // hex — token hashes, dedupe keys, ip hashes (with salt)
randomToken(bytes = 32)    // hex
safeEqual(a, b)            // timing-safe compare (webhook signatures, tokens)
maskSecret(value)          // 'abcd••••wxyz' / '••••••••'
// key = scrypt(SETTINGS_SECRET, 'socialz.secrets.v1', 32); missing SETTINGS_SECRET → throws at boot
```

- **Social tokens use AAD** = `${socialAccountId}|${platform}`, so a ciphertext copied onto another row fails to decrypt. Settings and gateway secrets use no AAD.
- **Versioning**: the `v1` in the prefix names the key version. Rotation adds `SETTINGS_SECRET_V2`, writes new values as `enc:v2:…`, and `scripts/rotate-keys.ts` re-encrypts old rows (social tokens, gateway keys, secret settings). Until rotation is needed, v1 is the only key (`../ARCHITECTURE.md` §19).
- **Decrypted tokens never leave the server.** They are decrypted inside the channel adapter call and never logged, returned, or stored in job payloads (jobs carry ids only).

## 4. Rate limiting

`server/core/rate-limit.ts`: fixed windows in Postgres, shared by every function instance. One statement per check:

```sql
INSERT INTO rate_limit_buckets (key, window_start, count, expires_at)
VALUES ($key, $windowStart, 1, $windowStart + $window)
ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
RETURNING count;
```

The table is `UNLOGGED` (counters may be lost on a database crash, which is acceptable) and purged by `maintenance.purge`. Hot public paths (redirects, Etalase, webhooks) are protected by Cloudflare rate limiting rules first, so they don't add a write per request.

```ts
assertRateLimit(scope, identifier, limit, windowMs)  // throws 429 RATE_LIMITED with retryAfterSeconds
resetRateLimit(key)
clientIp(event)        // CF-Connecting-IP → x-forwarded-for[0] → socket (Cloudflare is the first hop in production)
```

| Scope | Limit |
|---|---|
| sign-in per identifier / per IP | better-auth limiter: 5 per 15 min per email, 20 per 15 min per IP |
| `oauth:channel` (connect social account) | 20 / 15 min per user |
| `contact` | setting `app.contactRateLimitPerHour` per IP |
| `usage-ping` | 120 / h per user |
| `link:create` | 120 / h per workspace (abuse guard for short links) |
| `media:presign` | 60 / h per workspace |
| `webhooks:*` | 600 / min per IP |

The redirect route (`/r/[slug]`) is protected by Cloudflare in front of the short domain, not by the Postgres limiter.

## 5. "Last seen"

`touchLastSeen(audience, userId)` is called by the context gatekeepers after all checks pass. It writes `lastSeenAt` **at most once per 15 minutes per user** with a conditional `UPDATE … SET last_seen_at = now() WHERE id = $id AND (last_seen_at IS NULL OR last_seen_at < now() - interval '15 minutes')`, sent through `ctx.defer()`. Never awaited by the request, never throws. No in-memory map (instances share nothing). `lastLoginAt` moves only on sign-in. Both show in admin user lists; inactivity reminders read `lastSeenAt ?? lastLoginAt`.

## 6. Product analytics — counters, not people

- Table `usage_daily (dateKey, device, count)`: **device-days, no user id, no session id**. About 3 rows per day; no rollup job.
- `POST /api/app/usage/ping { device: 'phone'|'tablet'|'desktop', lastCountedDate? }` from the console once per day.
- Authenticates on the session alone (no workspace context needed). Impersonated sessions are never counted.
- The "already counted today" flag lives in the browser (localStorage, wrapped in try/catch). The browser sends the date key it stored; **the server compares it against its own clock** (Asia/Jakarta) and never trusts the device's date. Response `{ dateKey, counted }`.
- Increment via upsert (`ON CONFLICT … DO UPDATE SET count = count + 1`).
- `/admin/reports` labels sums as *hari akses* (access-days), not unique users.
- The back-office pings nothing. Creator business metrics (posts published, clicks, DMs) come from domain tables, not from this counter.

## 7. Language policy

**Everything a creator reads is in Bahasa Indonesia by default, with English as a secondary locale. Everything a developer reads is English.**

| Bahasa (+ English locale) | English only |
|---|---|
| UI copy, toasts, empty/error states, confirmations (i18n files `id.json`, `en.json`) | identifiers, comments |
| zod messages (Bahasa; client forms show i18n'd messages first) | DB tables/columns, enum values, status slugs |
| API error `statusMessage` (Bahasa) | API field names, error `code`s |
| email + notification templates (Bahasa; English variants optional later) | permission keys, menu slugs, routes |
| landing, legal pages, FAQ (Bahasa + `/en/` landing) | env vars, git commits, every repo doc |
| seeded content (plan names, permission descriptions, menu labels) | |
| status labels via label maps; formatting (`Rp 25.000`, `11 Agustus 2026`) | |

- An English slug never reaches a screen by being rendered directly. Every enum has a label map and one component renders it.
- Plain, friendly wording, the way a beginner seller speaks; consistent second person (*kamu* in the creator console and landing, *Anda* in legal pages and billing emails). Decide once in the i18n style guide and keep it.
- **Banned words in creator UI**: webhook, token, API, container, slug, UTM, OAuth, cron, queue. Use the plain alternatives from `../ARCHITECTURE.md` §1.1.
- The `/admin` back-office is Bahasa only, with a **closed list** of English labels (e.g. "Payment gateway", "Webhook", "Dead letter", "Impersonate"). Adding to the list is a product decision.

## 8. Money

- Platform money (plan prices): `numeric(14,2)` in DB, **plain number** over the wire; one conversion module `server/core/money.ts`:

  ```ts
  toAmount(value: string | number | null): number   // → number, 0 for null/NaN
  toRupiah(value: number): number                    // whole rupiah (Math.round)
  ```

- Gateway amounts: `integer` rupiah, end to end.
- Product prices on links and Etalase items are `bigint` rupiah (`price_idr`), display-only (Socialz.id never sells products).
- Never `float`, never decimal strings in API payloads.
- The server resolves every price-like value (plan price at checkout). A client-sent amount is never the authority.
- Server-side currency formatting for emails replaces the non-breaking space `Intl` emits.

## 9. Time

- Store UTC (`timestamp with time zone`). Convert at the edges only.
- Supported zones (Indonesia): `Asia/Jakarta` (WIB), `Asia/Makassar` (WITA), `Asia/Jayapura` (WIT): no DST, fixed offsets. Platform clock = Jakarta. Workspace timezone is auto-detected at signup from the browser (falls back to WIB).
- **Scheduled posts store `scheduled_at` as a UTC instant.** The composer shows and picks times in the workspace timezone; the server never interprets a naive local time.
- `server/core/timezone.ts`: `zonedDateKey(instant, tz)`, `startOfZonedDay(key, tz)`, `zonedDayRange(key, tz)` (half-open), `zonedRange(fromKey, toKey, tz)`, `todayKey(tz)`, `addDaysToKey`, `addMonthsToKey`, `startOfMonthKey`, `endOfMonthKey`, `isDateKey`.
- **Local-day bucketing happens in SQL** and must declare the column as UTC before converting when the column is zone-less: `(col AT TIME ZONE 'UTC') AT TIME ZONE $tz`. With `timestamptz` columns a single `col AT TIME ZONE $tz` is correct; never mix the two forms.
- Monthly limits (`scheduledPostsPerMonth`, `autoReplyDmsPerMonth`) are counted per calendar month on the **workspace** clock.

## 10. Data integrity rules

- **Soft delete for workspaces; deactivate for members, staff, plans in use, roles in use, menus with children, social accounts over the cap, auto-reply rules over the cap.** Anything history points at returns 409 "nonaktifkan saja".
- Snapshot names and prices onto historical rows (payments carry `planSlug` and amount; published targets keep the caption they were published with), so editing a catalog never rewrites history.
- Denormalized counters (`usage_counters`) are moved only by one function, inside the same transaction as the write that justifies them.
- Idempotency keys on anything retried: payment webhook `dedupeKey`, Meta webhook `(provider, dedupe_key)`, `dm_events (social_account_id, comment_id)`, unique order ids, job `singleton_key`s, schedule slot claims, conditional `UPDATE … WHERE status = …` claims for single-use tokens and job rows.
- Transactions wrap "one fact" (payment paid + plan activated; account deactivation + "please choose" flag; post scheduled + its job enqueued). Network calls (email, Meta, hub, R2) stay **outside** transactions.

## 11. Repository hygiene

- `CHANGELOG.md` entry for every change; `package.json` `version` equals the top heading. The heading carries state: `## 0.4.0 (Draft)` while in progress, `## 0.4.0 (Released)` once deployed; a Released entry is never edited. Minor for features, patch for fixes. Bullets describe the user-visible effect, in English.
- `CLAUDE.md` records architecture decisions, the expensive-to-rediscover rules, and the **list of deliberately unbuilt features** (out of scope), so they aren't half-built by accident.
- ESLint stylistic (`commaDangle: 'never'`, `braceStyle: '1tbs'`); relax only with a reason in the config.
- **Tests exist and are expected** for core billing, publishing, webhook and entitlement logic: Vitest unit + integration (real Postgres, fake channel `fetch`, recorded Graph fixtures) and Playwright E2E for the newcomer flow (see `../ARCHITECTURE.md` §15). UI-only changes are verified by exercising them in the running app in light and dark mode at phone and desktop widths.
- Definition of done for every change: lint clean, typecheck of changed files clean, tests for the touched core module pass, changelog updated (`17`).
- Typecheck can be memory-heavy on small servers: scope it to changed files with a throwaway tsconfig that extends the generated one and keeps the ambient `.d.ts` entries.
