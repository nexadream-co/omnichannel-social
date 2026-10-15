import { PAYMENT_STATUSES, type PaymentStatusValue } from '../../../../shared/utils/payments'
import { appError } from '../../errors'
import { log } from '../../log'
import type { GatewayCredentials, NormalizedPayment, PaymentDriver } from './types'

/**
 * Nexadream Payment Hub (docs/blueprint/08 §5, https://nexadream.id/docs/payment-hub). The hub lends one
 * merchant account to several platforms, routed by an order-id prefix. Callbacks are the gateway's raw,
 * unverifiable payload, so the receiver always re-reads the status (trustsWebhookPayload = false).
 */
type HubTransaction = {
  orderId?: string
  reference?: string
  redirectUrl?: string
  token?: string | null
  clientKey?: string | null
  status?: string
  gatewayStatus?: string
  amount?: number | string
  currency?: string
  paymentType?: string | null
  settlementTime?: string | null
  alreadyCancelled?: boolean
}

const str = (v: unknown): string | null => (typeof v === 'string' && v) || (typeof v === 'number' ? String(v) : null)

function base(creds: GatewayCredentials): string {
  const url = (creds.baseUrl ?? '').trim().replace(/\/+$/, '')
  if (!url) throw appError(503, 'Alamat Payment Hub belum diatur.', 'SERVER_ERROR')
  return `${url}/api/hub/v1/transactions`
}

async function call(creds: GatewayCredentials, path: string, init: { method: 'GET' | 'POST', body?: unknown }, fetchImpl: typeof fetch = fetch): Promise<HubTransaction> {
  let res: Response
  try {
    res = await fetchImpl(`${base(creds)}${path}`, {
      method: init.method,
      headers: { authorization: `Bearer ${creds.serverKey}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000)
    })
  } catch (error) {
    log.warn('payments.hub.network', { path, error })
    throw appError(502, 'Gateway menolak permintaan, coba lagi sebentar lagi.', 'SERVER_ERROR')
  }
  const body = await res.json().catch(() => ({})) as HubTransaction & { statusMessage?: string }
  if (res.ok) return body
  // The hub's own message goes to the log, never to the user.
  log.warn('payments.hub.error', { path, status: res.status, message: body.statusMessage })
  if (res.status === 404) throw appError(404, 'Pembayaran tidak ditemukan di Payment Hub.', 'NOT_FOUND')
  if (res.status === 409) throw appError(409, 'Pembayaran sudah diproses, tidak bisa dibatalkan.', 'CONFLICT')
  if (res.status === 501) throw appError(501, 'Gateway tidak mendukung pembatalan.', 'SERVER_ERROR')
  if (res.status === 401 || res.status === 403) throw appError(503, 'Pembayaran sedang tidak tersedia, hubungi dukungan.', 'SERVER_ERROR')
  throw appError(502, 'Gateway menolak permintaan, coba lagi sebentar lagi.', 'SERVER_ERROR')
}

function toStatus(v?: string): PaymentStatusValue {
  const s = String(v ?? '').toLowerCase()
  return (PAYMENT_STATUSES as readonly string[]).includes(s) ? s as PaymentStatusValue : 'pending' // unknown = not money yet
}

function toReference(p: HubTransaction, creds: GatewayCredentials): string {
  if (p.reference) return p.reference
  const prefix = (creds.orderPrefix ?? '').trim()
  const id = p.orderId ?? ''
  return prefix && id.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : id
}

function normalize(p: HubTransaction, creds: GatewayCredentials): NormalizedPayment {
  const status = toStatus(p.status)
  return {
    orderId: toReference(p, creds),
    status,
    rawStatus: p.gatewayStatus || p.status || 'unknown',
    amount: Math.round(Number(p.amount ?? 0)),
    currency: String(p.currency ?? 'IDR'),
    paymentType: p.paymentType ?? null,
    paidAt: status === 'paid' && p.settlementTime ? new Date(p.settlementTime) : null,
    raw: p as Record<string, unknown>
  }
}

export const nexadreamHubDriver: PaymentDriver = {
  provider: 'nexadream_hub',
  trustsWebhookPayload: false,

  async createCharge(creds, input, fetchImpl) {
    const expiryMinutes = input.expiresAt ? Math.min(43_200, Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60_000))) : 60
    const name = input.itemName.slice(0, 50)
    const res = await call(creds, '', {
      method: 'POST',
      body: {
        reference: input.orderId,
        amount: input.amount,
        currency: input.currency,
        customer: { firstName: input.customer.name.slice(0, 50), email: input.customer.email ?? undefined, phone: input.customer.phone ?? undefined },
        // The hub checks items sum exactly to amount: one line at the full amount.
        items: [{ id: 'subscription', name, price: input.amount, quantity: 1 }],
        finishUrl: input.successUrl,
        metadata: input.metadata,
        expiryMinutes
      }
    }, fetchImpl)
    if (!res.redirectUrl) throw appError(502, 'Gateway tidak mengembalikan halaman pembayaran.', 'SERVER_ERROR')
    return {
      orderId: res.reference ?? input.orderId,
      gatewayOrderId: res.orderId,
      redirectUrl: res.redirectUrl,
      token: res.token ?? undefined,
      clientKey: res.clientKey ?? undefined,
      expiresAt: input.expiresAt,
      raw: res as Record<string, unknown>
    }
  },
  async createSubscription() {
    throw appError(501, 'Gateway tidak mendukung langganan otomatis.', 'SERVER_ERROR')
  },
  async cancelSubscription() {},
  async cancelCharge(creds, orderId, fetchImpl) {
    const res = await call(creds, `/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' }, fetchImpl)
    return { ...normalize(res, creds), alreadyCancelled: Boolean(res.alreadyCancelled) }
  },
  async getStatus(creds, orderId, fetchImpl) {
    return normalize(await call(creds, `/${encodeURIComponent(orderId)}`, { method: 'GET' }, fetchImpl), creds)
  },

  verifyWebhook: () => false,
  normalizeWebhook: () => {
    throw appError(500, 'Callback Payment Hub tidak bisa dipercaya langsung.', 'SERVER_ERROR')
  },
  // The upstream gateway's raw payload reaches us untouched: its own field names.
  webhookOrderId: p => str(p.order_id ?? p.external_id ?? p.id),
  webhookDedupeSource: p => [p.order_id ?? p.external_id ?? p.id, p.transaction_status ?? p.status, p.transaction_id ?? p.status_code ?? ''].map(v => String(v ?? '')).join(':'),
  webhookStatus: p => str(p.transaction_status ?? p.status),
  redirectOrderId: q => str(q.reference ?? q.order_id)
}
