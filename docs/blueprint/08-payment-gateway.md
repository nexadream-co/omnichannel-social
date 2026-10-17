# 08 — Payment Gateway (Nexadream Payment Hub)

> **Reference links**
> - Payment Hub host (default `baseUrl`): <https://nexadream.id>
> - Payment Hub API documentation: <https://nexadream.id/docs/payment-hub>
> - API base path used by the driver: `https://nexadream.id/api/hub/v1/transactions`
>
> Read the hub documentation before implementing. If it disagrees with §5 below, the hub documentation wins.

The payment layer is provider-agnostic **by contract**. This is a product requirement (it protects against vendor lock-in on a cost-sensitive part of the stack), not a style preference.

```
server/core/services/payments/
  types.ts           driver contract — the ONLY place business code imports payment types from
  index.ts           registry, getPaymentDriver(), getActiveGateway(), getGatewayCredentials()
  nexadream-hub.ts   the live driver
  <other>.ts         scaffolded drivers that throw 501 (proves the seam is real)
shared/utils/payments.ts                 PAYMENT_PROVIDERS catalog + our status vocabulary
server/core/checkout.ts                  startCheckout, cancelWorkspacePayment
server/core/payment-apply.ts             normalizeCallback, applyPayment
server/core/payment-reconcile.ts         reconcilePendingPayments
server/api/webhooks/payments/[provider].post.ts   callback receiver
server/api/admin/payment-gateways/*      credentials editor
server/api/admin/webhook-events/*        callback log + replay
```

## 1. Non-negotiables

- **Our own status vocabulary** everywhere: `pending | paid | failed | expired | refunded | cancelled | challenge`. The provider's raw word is kept in `rawStatus` for support only.
- **Amounts are integers in rupiah** across the whole payment path (`49000`, never `49000.00`). Never `float`.
- **Credentials live in a `payment_gateways` row**, edited at `/admin/payment-gateways`. Secrets are **encrypted at rest** (AES-256-GCM, `enc:v1:<iv>:<tag>:<ct>`) and **never returned raw** (only masked).
- **Exactly one gateway is active.** Activating one deactivates the others in the same transaction.
- **Webhooks have no auth middleware; the driver decides what makes a callback trustworthy.** Every raw callback is persisted (deduped) before it is applied.
- **Never fulfil from unverifiable callback content.** If the driver cannot verify a signature (the hub's case), re-read the status from the provider.
- **No provider vocabulary outside the provider file** (hosts, status words, field names, signature recipes). The only exceptions are the provider catalog and the admin form, which are data.
- Adding a gateway = **one new driver file + one line in `DRIVERS` + one entry in `PAYMENT_PROVIDERS`**.

## 2. Driver contract (`types.ts`)

```ts
import type { PaymentStatusValue } from '#shared/utils/payments'

export interface GatewayCredentials {
  provider: string
  serverKey: string        // decrypted at call site; hub: the platform API key
  clientKey: string
  merchantId?: string
  baseUrl?: string         // hub host
  orderPrefix?: string     // prefix the hub issued to Socialz.id
  isSandbox: boolean
  config?: Record<string, unknown>
}

export interface ChargeCustomer { name: string, email?: string | null, phone?: string | null }

export interface CreateChargeInput {
  orderId: string          // OUR order id
  amount: number           // integer rupiah
  currency: string
  itemName: string
  customer: ChargeCustomer
  successUrl: string
  failureUrl: string
  expiresAt?: Date
  metadata?: Record<string, unknown>
}

export interface CreateChargeResult {
  orderId: string
  gatewayOrderId?: string  // what the gateway sees (hub: PREFIX-orderId) — callbacks use this
  redirectUrl: string      // hosted payment page
  token?: string
  clientKey?: string
  expiresAt?: Date
  raw?: Record<string, unknown>
}

export interface NormalizedPayment {
  orderId: string          // OUR order id
  status: PaymentStatusValue
  rawStatus: string
  amount: number
  currency: string
  paymentType?: string | null
  paidAt?: Date | null
  raw?: Record<string, unknown>
}

export interface CancelChargeResult extends NormalizedPayment { alreadyCancelled: boolean }

export interface CreateSubscriptionInput { name: string, amount: number, currency: string,
  period: 'monthly' | 'yearly', customer: ChargeCustomer, paymentToken: string,
  startAt?: Date, metadata?: Record<string, unknown> }
export interface SubscriptionResult { providerRef: string, status: string, raw?: Record<string, unknown> }

export interface PaymentDriver {
  readonly provider: string
  /** true: shared signing secret → verify then apply payload.
   *  false: unsigned nudge → read order id, then getStatus(). */
  readonly trustsWebhookPayload: boolean

  createCharge(creds, input: CreateChargeInput): Promise<CreateChargeResult>
  createSubscription(creds, input: CreateSubscriptionInput): Promise<SubscriptionResult> // 501 if unsupported
  cancelSubscription(creds, providerRef: string): Promise<void>
  cancelCharge(creds, orderId: string): Promise<CancelChargeResult>  // pending/challenge only; 409 if settled
  getStatus(creds, orderId: string): Promise<NormalizedPayment>      // authoritative

  verifyWebhook(creds, payload, headers): boolean
  normalizeWebhook(payload): NormalizedPayment
  webhookOrderId(payload): string | null        // gateway's id (prefixed on a hub)
  webhookDedupeSource(payload): string          // stable fingerprint
  webhookStatus(payload): string | null         // provider's raw word, for the callback log
  redirectOrderId(query): string | null         // order id on the return redirect
}
```

## 3. Registry (`index.ts`)

```ts
const DRIVERS: Record<string, PaymentDriver> = {
  [nexadreamHubDriver.provider]: nexadreamHubDriver,
  // [otherDriver.provider]: otherDriver,
}

isSupportedProvider(provider): boolean
getPaymentDriver(provider): PaymentDriver               // 400 if unknown
listPaymentDrivers(): string[]

/** The one place a stored row becomes usable credentials. */
function toCredentials(row): GatewayCredentials {
  return { provider: row.provider, serverKey: decrypt(row.serverKey),
           clientKey: row.clientKey ? decrypt(row.clientKey) : '',
           merchantId, baseUrl, orderPrefix, isSandbox, config }
}

getActiveGateway(): { driver, creds } | null   // isActive row with a serverKey and a known driver
getGatewayCredentials(provider): creds | null  // for the webhook of a named provider
requireActiveGateway(g)                        // 503 "Pembayaran sedang tidak tersedia, hubungi dukungan."
```

## 4. Provider catalog (`shared/utils/payments.ts`)

The catalog drives the admin form and the "may this gateway go live" check, so a new provider needs no new UI.

```ts
export interface PaymentCredentialFieldMeta {
  key: 'serverKey' | 'clientKey' | 'merchantId' | 'baseUrl' | 'orderPrefix'
  label: string; hint?: string; placeholder?: string
  secret: boolean        // stored encrypted, password input, never shown again
}

export interface PaymentProviderMeta {
  value: string; label: string; description: string; icon: string; docsUrl: string
  isImplemented: boolean      // false = scaffold that throws
  supportsRecurring: boolean
  supportsSandbox: boolean    // false hides the sandbox toggle
  fields: PaymentCredentialFieldMeta[]
}

export const PAYMENT_PROVIDERS: PaymentProviderMeta[] = [
  {
    value: 'nexadream_hub',
    label: 'Nexadream Payment Hub',
    description: 'Satu akun merchant Nexadream dipakai bersama. Mendukung kartu, VA bank, e-wallet dan QRIS, tanpa menyimpan kunci rahasia gateway di platform.',
    icon: 'i-lucide-credit-card',
    docsUrl: 'https://nexadream.id/docs/payment-hub',
    isImplemented: true,
    supportsRecurring: false,
    supportsSandbox: false,
    fields: [
      { key: 'serverKey', label: 'Kunci API', secret: true, placeholder: 'phk_live_…',
        hint: 'Kunci platform dari Payment Hub, diawali phk_live_. Disimpan terenkripsi dan tidak pernah ditampilkan lagi.' },
      { key: 'baseUrl', label: 'Alamat Payment Hub', secret: false, placeholder: 'https://nexadream.id',
        hint: 'Tanpa garis miring di akhir.' },
      { key: 'orderPrefix', label: 'Prefiks nomor pesanan', secret: false, placeholder: '{{ORDER_PREFIX}}',
        hint: 'Prefiks yang diberikan Payment Hub untuk Socialz.id. Dipakai untuk mencocokkan callback dengan pembayaran.' }
    ]
  }
]

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'challenge'] as const
export const BILLING_PERIODS = ['monthly', 'yearly'] as const
```

## 5. The Nexadream Payment Hub driver

### 5.1 What the hub is

The hub fronts **one upstream merchant account** and lends it to several platforms. Socialz.id holds a **platform API key** (`phk_live_…`); the gateway's signing secret never leaves the hub. Routing is by an **order-id prefix** the hub issues to each platform: our `reference` goes upstream as `{{ORDER_PREFIX}}-<reference>`, and the hub hands our own reference back on every read.

Two consequences:

1. **Callbacks cannot be verified.** They arrive as the gateway's raw payload, signed with a secret we don't have. So `trustsWebhookPayload = false`, and the receiver confirms with `getStatus` before applying anything.
2. **No recurring API, no sandbox.** A renewal is a fresh checkout (see `07` §7).

Because other platforms share the merchant account, **callbacks for orders we never created will arrive**. That is normal: store them, answer 200, apply nothing.

### 5.2 HTTP calls

All requests use `Authorization: Bearer <serverKey>`, JSON in and out. The base is `creds.baseUrl` (trimmed, no trailing slash; missing → 503 "Alamat Payment Hub belum diatur.").

| Purpose | Request | Notes |
|---|---|---|
| Create charge | `POST {base}/api/hub/v1/transactions` | body below |
| Get status | `GET {base}/api/hub/v1/transactions/{ourReference}` | never the prefixed id |
| Cancel charge | `POST {base}/api/hub/v1/transactions/{ourReference}/cancel` | 200 + `alreadyCancelled:true` if already cancelled; 409 if settled |

Create-charge body:

```json
{
  "reference": "<our orderId, e.g. SZ-MF3K9Q2A-7XQ1>",
  "amount": 49000,
  "currency": "IDR",
  "customer": { "firstName": "<name, max 50>", "email": "…", "phone": "…" },
  "items": [{ "id": "subscription", "name": "Socialz.id Kreator — Bulanan", "price": 49000, "quantity": 1 }],
  "finishUrl": "<successUrl>",
  "metadata": { "workspaceId": "…", "planSlug": "kreator", "period": "monthly" },
  "expiryMinutes": 60
}
```

- The hub validates that items sum exactly to `amount`, so send **one line** at the full amount. Item names are truncated to 50 characters.
- `expiryMinutes` = clamp(round((expiresAt − now)/60000), 1, 43200).
- Error and pending redirects are configured per platform at the hub; only the finish URL is per payment.

Hub transaction response fields used: `orderId` (prefixed, = our `gatewayOrderId`), `reference` (ours), `redirectUrl`, `token`, `clientKey`, `status` (already in our 7-word vocabulary), `gatewayStatus` (raw), `amount`, `currency`, `paymentType`, `settlementTime`, `alreadyCancelled`.

Error mapping (the hub's own message goes to the **log**, never to the user):

| Hub HTTP | We throw | Message (user-facing) |
|---|---|---|
| 404 | 404 `NOT_FOUND` | "Pembayaran tidak ditemukan di Payment Hub." |
| 409 | 409 `CONFLICT` | "Pembayaran sudah diproses, tidak bisa dibatalkan." |
| 501 | 501 | "Gateway tidak mendukung pembatalan." |
| 401 / 403 | **503** `SERVER_ERROR` | "Pembayaran sedang tidak tersedia, hubungi dukungan." (misconfigured key) |
| other | 502 `SERVER_ERROR` | "Gateway menolak permintaan, coba lagi sebentar lagi." |
| 2xx without `redirectUrl` on create | 502 | "Gateway tidak mengembalikan halaman pembayaran." |

### 5.3 Normalization

```ts
function toStatus(v?: string): PaymentStatusValue {
  const s = String(v ?? '').toLowerCase()
  return (PAYMENT_STATUSES as readonly string[]).includes(s) ? s as PaymentStatusValue : 'pending'  // unknown = "not money yet"
}

function toReference(p, creds): string {
  if (p.reference) return p.reference
  const prefix = (creds.orderPrefix ?? '').trim()
  const id = p.orderId ?? ''
  return prefix && id.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : id
}

function normalize(p, creds): NormalizedPayment {
  const status = toStatus(p.status)
  return {
    orderId: toReference(p, creds),
    status,
    rawStatus: p.gatewayStatus || p.status || 'unknown',
    amount: Math.round(Number(p.amount ?? 0)),
    currency: String(p.currency ?? 'IDR'),
    paymentType: p.paymentType ?? null,
    paidAt: status === 'paid' && p.settlementTime ? new Date(p.settlementTime) : null,
    raw: p
  }
}
```

### 5.4 Driver methods

```ts
export const nexadreamHubDriver: PaymentDriver = {
  provider: 'nexadream_hub',
  trustsWebhookPayload: false,

  createCharge: /* POST transactions → { orderId: res.reference ?? input.orderId,
                   gatewayOrderId: res.orderId, redirectUrl, token, clientKey, expiresAt, raw } */,
  createSubscription: () => { throw 501 },          // no recurring API
  cancelSubscription: async () => {},               // nothing upstream to cancel
  cancelCharge: /* POST …/cancel → { ...normalize(res), alreadyCancelled: !!res.alreadyCancelled } */,
  getStatus: /* GET …/{reference} → normalize(res) */,

  verifyWebhook: () => false,                       // never called (trustsWebhookPayload=false)
  normalizeWebhook: () => { throw 500 },            // never called

  // The raw upstream gateway payload reaches us untouched → its field names:
  webhookOrderId: p => str(p.order_id ?? p.external_id ?? p.id),
  webhookDedupeSource: p => [p.order_id ?? p.external_id ?? p.id,
                             p.transaction_status ?? p.status,
                             p.transaction_id ?? p.status_code ?? ''].join(':'),
  webhookStatus: p => str(p.transaction_status ?? p.status),
  redirectOrderId: q => str(q.reference ?? q.order_id)   // hub appends OUR reference
}
```

All HTTP calls use a 15 s timeout (`AbortSignal.timeout(15_000)`). The driver receives `fetch` from its caller so tests can pass a fake.

### 5.5 Matching callbacks to payments

- Checkout stores the hub's prefixed id in `payments.gatewayOrderId` (unique).
- A callback carries the **prefixed** id, so match on `gatewayOrderId` **exactly**. Never reconstruct it by stripping the prefix (that would break silently if the hub reassigns a prefix).
- All reads back to the hub use **our** `orderId` (the reference).

### 5.6 Registration with the hub administrator

When provisioning or moving an environment, give the hub admin these values (the hub holds them, Socialz.id does not):

| What | Value |
|---|---|
| Webhook | `{{SITE_URL}}/api/webhooks/payments/nexadream_hub` |
| Finish redirect | `{{SITE_URL}}/app/billing?status=success` |
| Error redirect | `{{SITE_URL}}/app/billing?status=failed` |
| Pending redirect | `{{SITE_URL}}/app/billing?status=pending` |

Receive from them the **platform API key** and the **order prefix**. Enter both (plus the base URL) at `/admin/payment-gateways`, then activate.

## 6. Webhook receiver: `POST /api/webhooks/payments/[provider]`

The route is a Nitro handler with no session middleware. It calls core payment functions directly (there is no workspace context: the payment row tells us the workspace).

```ts
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')!
  if (!isSupportedProvider(provider)) throw createError({ statusCode: 404 })
  const payload = await readBody(event).catch(() => null)
  if (!payload || typeof payload !== 'object') throw createError({ statusCode: 400 })

  const creds = await getGatewayCredentials(provider)
  if (!creds) throw createError({ statusCode: 503 })              // not configured

  const driver = getPaymentDriver(provider)
  const headers = getRequestHeaders(event)
  if (driver.trustsWebhookPayload && !driver.verifyWebhook(creds, payload, headers)) {
    throw createError({ statusCode: 401 })                        // reveal nothing about why
  }

  const gatewayOrderId = driver.webhookOrderId(payload)
  const dedupeKey = `${provider}:${sha256(driver.webhookDedupeSource(payload))}`

  // insert-or-get: ON CONFLICT (dedupe_key) DO NOTHING, then select
  const record = await upsertPaymentWebhookEvent({ provider, dedupeKey, orderId: gatewayOrderId, payload, headers })
  if (record.processedAt) return { received: true, duplicate: true }

  try {
    const normalized = await normalizeCallback(driver, creds, payload)
    if (!normalized) {                                            // not our order (shared merchant)
      await markProcessed(record, { error: 'unknown order' })
      return { received: true, applied: false }                   // 200 — retrying changes nothing
    }
    const result = await applyPayment(normalized)
    await markProcessed(record, {
      orderId: gatewayOrderId ?? normalized.orderId,
      error: result.applied || result.noop ? null : result.reason ?? null   // a no-op is healthy
    })
    return { received: true, applied: result.applied }
  } catch (e) {
    await setWebhookEventError(record.id, (e as Error).message)
    throw createError({ statusCode: 500 })                        // provider retries; row kept for replay
  }
})
```

`normalizeCallback(driver, creds, payload)`:

```ts
if (driver.trustsWebhookPayload) return driver.normalizeWebhook(payload)
const gatewayOrderId = driver.webhookOrderId(payload)
if (!gatewayOrderId) throw new Error('callback carried no order id')
const [payment] = await db.select({ orderId: payments.orderId }).from(payments)
  .where(eq(payments.gatewayOrderId, gatewayOrderId)).limit(1)
if (!payment) return null                       // another platform's order
return driver.getStatus(creds, payment.orderId) // the truth, from the hub
```

`applyPayment` is described in `07-subscription-lifecycle.md` §4.

## 7. Admin replay: `POST /api/admin/webhook-events/:id/replay`

Permission `payments.write`. It loads the stored event and refuses with 409 if the provider is no longer supported or has no credentials. It then runs the **same** `normalizeCallback` (for the hub this re-reads the live status, which is safer than re-applying a stale payload) and `applyPayment`, sets `processedAt`, increments `replayCount`, clears `error` on applied/no-op, and audits `payment.webhook_replay`. Pressing it twice is safe.

`GET /api/admin/webhook-events` lists events with filters (provider, processed/error, search by order id). It shows **what the gateway said** (`driver.webhookStatus(payload)`) next to **what we did** (processed / error).

## 8. Reconciliation (safety net)

Unverifiable callbacks can also be missed. The `billing.daily` job (see `15`) re-reads every payment still `pending` that was created in the last **48 hours** (max 200, oldest first) from the **active** gateway and pushes each one through `applyPayment`. An error on one order is logged and skipped. The step is idempotent.

```ts
export async function reconcilePendingPayments(): Promise<{ checked: number, updated: number }>
```

## 9. Admin gateway configuration: `/admin/payment-gateways`

- `GET /api/admin/payment-gateways` (`payments.read`) returns `{ providers: PAYMENT_PROVIDERS, items: [{ id, provider, label, isActive, isSandbox, merchantId, baseUrl, orderPrefix, serverKeyMasked, clientKeyMasked, hasServerKey, hasClientKey, updatedAt }] }`. `maskSecret(v)` gives `abcd••••wxyz` (or `••••••••` when ≤ 8 chars).
- `PATCH /api/admin/payment-gateways/:id` (`payments.write`):

  ```ts
  z.object({
    label: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    isSandbox: z.boolean().optional(),
    merchantId: z.string().nullable().optional(),
    baseUrl: z.url().nullable().optional().or(z.literal('')),
    orderPrefix: z.string().regex(/^[A-Za-z0-9_-]+$/).nullable().optional().or(z.literal('')),
    serverKey: z.string().optional(),   // '' = keep stored value
    clientKey: z.string().optional()
  })
  ```

  - An empty string from a cleared field becomes `null`; trailing slashes are stripped from `baseUrl`.
  - Activating an unimplemented provider → 409.
  - Activating requires **every field the catalog lists** to be present (new value or already stored), else 409 "Lengkapi <fields> terlebih dahulu."
  - In one transaction: if activating, deactivate every other gateway; update this one; secrets are written as `encrypt(value)` only when a new value is sent.
- Rows are seeded inactive, without credentials (`gateway-nexadream_hub` with `baseUrl: 'https://nexadream.id'`, `isSandbox: false`).

## 10. Adding another gateway later

1. `server/core/services/payments/<name>.ts` implementing `PaymentDriver` (start by throwing 501 everywhere; a scaffold proves the seam).
2. One line in `DRIVERS`.
3. One entry in `PAYMENT_PROVIDERS` with its `fields`.
4. Seed (and migrate) an inactive `payment_gateways` row.
5. If it signs webhooks with a shared secret: set `trustsWebhookPayload = true` and implement `verifyWebhook` + `normalizeWebhook`. If it supports mandates (for example recurring card or e-wallet auto-debit): implement `createSubscription` / `cancelSubscription` and store `subscriptions.providerRef`.

Nothing else in the codebase should change.

## 11. Test mode: the payment simulator

Development and staging must be able to exercise the whole payment path before (and independently of) the
Payment Hub. Test mode is a **real payment provider** (`simulator`, `server/core/services/payments/simulator.ts`)
that plays the hub's role, so nothing in checkout, callbacks, `applyPayment` or reconciliation is special-cased.

- **Same contract as the hub, on purpose:** `trustsWebhookPayload = false` (every callback is re-read with
  `getStatus`), a prefixed gateway order id (`SIM-<orderId>`, matched exactly), a hosted page, cancel → 409 once
  settled, an unpaid checkout reads as `expired` after its expiry. Its own state lives in `payment_simulations`
  (Postgres, so it works on any serverless host); the app's `payments` row is still the app's truth.
- **Hosted page** `/pay/simulator/:orderId` (data: `GET /api/test/payments/:orderId`, action:
  `POST /api/test/payments/:orderId/outcome`). Outcomes: `paid`, `paid_no_callback` (tests reconciliation),
  `challenge`, `failed`, `expired`, `cancelled`, and `refunded` once paid, with a chosen payment method. Each one
  updates the simulator's record, then sends a gateway-style raw callback (`settlement`, `deny`, `expire`, …) through
  `receivePaymentWebhook`, and redirects to the finish URL with display-only `reference` / `result` parameters.
- **Simulated time** (`POST /api/admin/workspaces/:id/test-clock`, card on `/admin/workspaces/:id`): end the trial,
  put the period end 3 days out (renewal reminder), end the period, end grace. It moves dates only, records a
  `subscription_events` row (`test_clock`) and an audit row, then runs `billing.daily` / `billing.renewal-reminders`
  immediately; statuses still change only through `transitionSubscription()`.
- **Never in production.** When `NUXT_PUBLIC_APP_ENV=production` the provider is hidden from
  `/admin/payment-gateways`, cannot be activated, `getActiveGateway()` ignores it, its endpoints answer 404 and the
  test clock is refused. The gateway row ships inactive in migration `0006` and the seed; the seed activates it in
  non-production environments when no other gateway is active.
- **Visible everywhere it matters:** a "Mode uji" notice on `/app/billing`, a "MODE UJI" banner on the hosted page,
  "Mode uji" on the gateway card and a "Simulasi" badge (with "Buka simulator") on `/admin/payments`.
- `scripts/mock-payment-hub.ts` remains for testing the **hub driver's HTTP** against a local stand-in; the
  simulator is what staging uses day to day.
