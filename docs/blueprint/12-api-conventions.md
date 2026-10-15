# 12 — API Conventions

## 1. The API surfaces

| Prefix | Consumer | Auth | Response shape |
|---|---|---|---|
| `/api/public/**` | landing site, Etalase SSR | none | plain JSON |
| `/api/app/**` | creator console | creator session cookie (`socialz.*`) | plain JSON; lists `{ items, meta, …extra }` |
| `/api/app/auth/**` | creator auth | better-auth creator instance | better-auth responses |
| `/api/admin/**` | back-office | staff session cookie (`socialz_staff.*`) | plain JSON; lists `{ items, meta }` |
| `/api/admin/auth/**` | staff auth | better-auth staff instance | better-auth responses |
| `/api/webhooks/payments/:provider` | Nexadream Payment Hub | driver-defined (hub: unsigned nudge, re-read status) | small JSON ack |
| `/api/webhooks/meta` | Meta (Instagram, Threads, Facebook) | `X-Hub-Signature-256` HMAC | `GET` echoes `hub.challenge`; `POST` returns 200 fast |
| `/api/meta/data-deletion`, `/api/meta/deauthorize` | Meta platform callbacks | `signed_request` HMAC | `{ url, confirmation_code }` / 200 |
| `/api/contact` | landing contact form | none (rate-limited, honeypot) | `{ success }` |

There is **no public, versioned API** (`/api/v1`), no API keys, and no response envelope. `/api/app/**` and `/api/admin/**` are private surfaces that may change together with the console that calls them. If a mobile app or third-party integration is ever planned, a frozen public API is a separate decision with its own blueprint section.

Short links and Etalase pages are **not** API routes. They are a server route (`server/routes/r/[slug].get.ts`) and an SSR page (`app/pages/bio/[handle].vue`); see `14`.

## 2. Thin handlers over core functions (MUST)

Every handler is a few lines over a `server/core/<module>` function. **Core functions take a context object, never an `H3Event`**, so job handlers can call the same function (see `01` §4). Adding a capability:

1. Put the logic, **including the role check and the plan check**, in `server/core/<module>.ts` as `doThing(ctx, input)`.
2. Export its zod schema from the same file (or from `shared/` if the client validates with it too, e.g. post drafts).
3. Write the handler:

```ts
// server/api/app/links/index.post.ts
export default defineEventHandler(async (event) => {
  const ctx = await requireWorkspaceContext(event)
  const body = await readValidatedJson(event, linkCreateSchema)
  return createLink(ctx, body)
})
```

```ts
// server/core/links/service.ts
export async function createLink(ctx: WorkspaceContext, input: LinkCreateInput) {
  assertAbility(ctx, 'links.manage')                                  // role first → 403
  if (input.slug) await requireEntitlement(ctx, 'customSlug')        // then plan → 402
  // …resolve server-side, one transaction, audit
}
```

A job handler calls `createLink(systemContext(workspaceId), input)` when it needs the same behaviour. `systemContext` carries the role `system`, which passes ability checks but never plan checks (plan checks still apply).

## 3. Validation (`server/utils/validate.ts`)

```ts
parseOrThrow(schema, input)            // first zod issue → 400 VALIDATION_FAILED { field }
readValidatedJson(event, schema)       // readBody + parseOrThrow
validatedQuery(event, schema)          // getQuery + parseOrThrow
assertJsonRequest(event)               // non-GET/HEAD/DELETE must be application/json → 415
```

- The **first** issue's message is surfaced verbatim to the user, so every zod message is written in Bahasa Indonesia (`'Judul produk minimal 2 karakter'`). `field` carries the English path (`'title'`).
- English-locale users still see the Bahasa server message for validation errors in v1. Client-side forms validate first with the same schema and show i18n'd messages, so the server message is a fallback.
- Post drafts are also checked against channel capabilities with `validateTarget()` (`../ARCHITECTURE.md` §6.1). Failures return **422 `CHANNEL_VALIDATION_FAILED`** with `details.issues` (the `Issue[]` list). The composer renders those issues with i18n keys, so this is the one error whose detail is structured rather than a single sentence.

## 4. Errors

Every surface uses the same convention:

```ts
throw createError({
  statusCode: 402,
  statusMessage: 'Paket Gratis hanya mengizinkan 2 akun sosial. Upgrade untuk menambah lagi.',
  data: { code: 'LIMIT_REACHED', limit: 'socialAccounts', max: 2, current: 2 }
})
```

In `server/core/**`, import `createError` explicitly from `h3` (no auto-imports). The client reads `statusMessage` and `data.code` from the error (`extractErrorMessage`, `extractErrorCode`; see `13` §1).

### 4.1 Error codes

`code` is English and stable. `statusMessage` is Bahasa and shown verbatim.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 / 415 / 422 | bad input (`data.field`) |
| `CHANNEL_VALIDATION_FAILED` | 422 | post draft breaks a channel rule (`data.issues`) |
| `UNAUTHENTICATED` | 401 | missing / invalid / expired session |
| `EMAIL_NOT_VERIFIED` | 403 | action needs a verified email (e.g. connecting a social account, checkout) |
| `PLAN_REQUIRED` | 402 | feature not in plan (`data.feature`) |
| `LIMIT_REACHED` | 402 | plan cap hit (`data.limit/max/current`) |
| `FORBIDDEN` | 403 | role / permission / impersonation |
| `WORKSPACE_SUSPENDED` | 403 | workspace suspended by staff |
| `WORKSPACE_DELETED` | 403 | workspace deleted |
| `ACCOUNT_REAUTH_REQUIRED` | 409 | the social account's token is expired or revoked (`data.socialAccountId`); the UI shows "Hubungkan ulang" |
| `PUBLISHING_PAUSED` | 503 | staff paused publishing or auto-reply platform-wide (setting kill switch) |
| `NOT_FOUND` | 404 | also used for resources of another workspace |
| `CONFLICT` | 409 | state conflict, duplicates, "nonaktifkan saja" |
| `RATE_LIMITED` | 429 | `data.retryAfterSeconds` |
| `SERVER_ERROR` | 5xx | generic; internal details never leak |

When `data.code` is absent, the client maps the status to a default code (400→VALIDATION_FAILED, 401→UNAUTHENTICATED, 402→PLAN_REQUIRED, 403→FORBIDDEN, 404→NOT_FOUND, 409→CONFLICT, 415/422→VALIDATION_FAILED, 429→RATE_LIMITED, else SERVER_ERROR).

**Unhandled errors never leak their message.** A Nitro error hook logs the original (with request id) and returns the generic Bahasa sentence `'Terjadi kesalahan. Coba lagi sebentar lagi.'` for any error that was not thrown deliberately with a `statusMessage`.

**Platform errors are translated, never forwarded.** A Meta Graph error (`code 190`, `9007`, `2207xxx`…) or a hub error never reaches the user as raw text. The channel adapter's `normalizeError` turns it into an `AdapterError`, and the core function maps that to one of the codes above with a plain Bahasa sentence and a fix action (see `../ARCHITECTURE.md` §1.1 rule 6).

## 5. Lists, filters, pagination

`parseListQuery(event)` (`server/utils/http.ts`) is shared by every list endpoint:

| Param | Default | Notes |
|---|---|---|
| `page` | 1 | ≥ 1 |
| `limit` | 20 | 1–**100** |
| `search` | `''` | trimmed |
| `dateFrom`, `dateTo` | null | ISO instants; `dateFrom` inclusive, `dateTo` exclusive |
| `sort`, `order` | null, `desc` | `sort` whitelisted per endpoint |
| `isActive` | null | `'true'` / `'false'` |
| domain filters | — | e.g. `status`, `platform`, `socialAccountId` on posts |

It returns `{ page, limit, search, dateFrom, dateTo, sort, order, isActive, offset }`, which the handler passes to the core function as a plain object.

**Every table is server-paginated.** No screen filters a full in-memory array. List endpoints answer:

```json
{ "items": [], "meta": { "page": 1, "limit": 20, "total": 134, "pageCount": 7 }, "totalClicks": 4210 }
```

`extra` keys hold aggregates over the *whole filtered set* (a sum of clicks) or flags (whether the plan allows export). The client reads those rather than summing the page in hand. An endpoint that also feeds a picker (e.g. the product link picker in the composer) accepts `?all=true` with a hard cap (200) to opt out of paging, plus `search` for anything larger.

The calendar is the exception to paging: `GET /api/app/posts/calendar?from&to` returns every target in a date window (max 62 days), because a calendar month must render whole.

## 6. Security on every mutating request

- **Session cookies** are HttpOnly, Secure, `SameSite=Lax` (better-auth default config with `cookiePrefix`).
- **CSRF:** `server/middleware/origin-check.ts` rejects any non-GET/HEAD/OPTIONS request to `/api/app/**` or `/api/admin/**` unless `Origin` (or `Sec-Fetch-Site: same-origin`) matches `NUXT_PUBLIC_SITE_URL`. better-auth also checks `trustedOrigins` on its own endpoints.
- **Webhooks** (`/api/webhooks/**`, `/api/meta/**`) and `/api/contact` are excluded from the origin check; they authenticate by signature, by re-reading from the provider, or by rate limit + honeypot.
- **Rate limits:** see `16` §4.

## 7. Raw bodies and webhooks

- `/api/webhooks/meta` (POST) reads the body with `readRawBody(event, false)` **before** any JSON parsing, because the HMAC is computed over the exact bytes. Instagram-Login webhooks are signed with the **Instagram app secret**; Facebook and Threads webhooks with their own app secret. The handler picks the secret from the payload's `object` field after a safe parse of the verified bytes.
- `/api/webhooks/payments/:provider` reads JSON; the hub driver does not trust the payload (`08` §6).
- Both store first (deduped row) and process later in a job (kicked with `waitUntil` right after the response). Both answer 200 quickly.

## 8. Uploads

- **Post media** (images and videos for publishing) never passes through the web server: `POST /api/app/media/presign { filename, mime, bytes }` returns a presigned R2 PUT URL plus a `mediaId`; the browser uploads directly; `POST /api/app/media/:id/complete` enqueues `media.process`. See `16` §1 and `../ARCHITECTURE.md` §8.
- **Small images** (creator avatar, Etalase avatar, product images, staff avatar, CMS images) go through `POST /api/app/uploads` or `POST /api/admin/uploads` (multipart field `file`) → `handleUpload(ctx, prefix, { maxBytes })` → `{ path, url, size, contentType }`.

## 9. Pre-flight checklist for a new endpoint

- [ ] Logic in a `server/core` function that takes `ctx`; handler ≤ ~5 lines.
- [ ] Exactly one gatekeeper in the handler; inside core, role check before plan check.
- [ ] Every Drizzle query in workspace context filters by `workspaceId`.
- [ ] zod schema with Bahasa messages; channel rules through `validateTarget()`.
- [ ] Errors via `createError({ statusCode, statusMessage, data: { code } })`; no raw platform error text.
- [ ] Lists server-paginated with `parseListQuery`.
- [ ] Mutating route covered by the origin check (automatic under `/api/app` and `/api/admin`).
- [ ] Audit row for sensitive actions (`16` §2).
- [ ] Network calls (email, Meta, hub) outside DB transactions.
