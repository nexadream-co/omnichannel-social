import { eq } from 'drizzle-orm'
import { SIMULATED_GATEWAY_WORDS } from '../../../../shared/utils/payments'
import { getDb } from '../../db/client'
import { paymentSimulations } from '../../db/schema'
import { env } from '../../env'
import { appError } from '../../errors'
import type { NormalizedPayment, PaymentDriver } from './types'

/**
 * Test-mode payment provider (docs/blueprint/08 §11). It behaves like the Nexadream hub on purpose:
 * unverifiable callbacks (trustsWebhookPayload = false), so every callback is re-read with getStatus, a
 * prefixed gateway order id, a hosted "payment page" (/pay/simulator/:orderId), cancel → 409 once settled.
 * State lives in payment_simulations, so it works on any serverless host.
 */
export const SIMULATOR_PREFIX = 'SIM'

export function simulatorAllowed(): boolean {
  return !env().isProduction
}

function assertAllowed() {
  if (!simulatorAllowed()) throw appError(503, 'Simulator pembayaran tidak tersedia di produksi.', 'SERVICE_UNAVAILABLE')
}

type Row = typeof paymentSimulations.$inferSelect

/** A pending charge past its expiry reads as expired, like a real checkout session timing out. */
function effectiveStatus(row: Row) {
  return row.status === 'pending' && row.expiresAt && row.expiresAt <= new Date() ? 'expired' : row.status
}

function normalize(row: Row): NormalizedPayment {
  const status = effectiveStatus(row)
  return {
    orderId: row.orderId, status, rawStatus: SIMULATED_GATEWAY_WORDS[status], amount: row.amount, currency: row.currency,
    paymentType: row.paymentType, paidAt: status === 'paid' ? row.settledAt : null,
    raw: { simulator: true, orderId: row.gatewayOrderId, reference: row.orderId, status, gatewayStatus: SIMULATED_GATEWAY_WORDS[status] }
  }
}

async function load(orderId: string): Promise<Row> {
  const [row] = await getDb().select().from(paymentSimulations).where(eq(paymentSimulations.orderId, orderId)).limit(1)
  if (!row) throw appError(404, 'Pembayaran tidak ditemukan di simulator.', 'NOT_FOUND')
  return row
}

const str = (v: unknown): string | null => (typeof v === 'string' && v) || null

export const simulatorDriver: PaymentDriver = {
  provider: 'simulator',
  trustsWebhookPayload: false,

  async createCharge(_creds, input) {
    assertAllowed()
    const gatewayOrderId = `${SIMULATOR_PREFIX}-${input.orderId}`
    await getDb().insert(paymentSimulations).values({
      orderId: input.orderId, gatewayOrderId, amount: input.amount, currency: input.currency, itemName: input.itemName.slice(0, 120),
      customerName: input.customer.name, finishUrl: input.successUrl, metadata: input.metadata ?? null, expiresAt: input.expiresAt ?? null
    })
    return { orderId: input.orderId, gatewayOrderId, redirectUrl: `${env().siteUrl}/pay/simulator/${encodeURIComponent(input.orderId)}`, expiresAt: input.expiresAt, raw: { simulator: true } }
  },
  async createSubscription() {
    throw appError(501, 'Gateway tidak mendukung langganan otomatis.', 'SERVER_ERROR')
  },
  async cancelSubscription() {},
  async cancelCharge(_creds, orderId) {
    assertAllowed()
    const row = await load(orderId)
    const status = effectiveStatus(row)
    if (status === 'cancelled') return { ...normalize(row), alreadyCancelled: true }
    if (status !== 'pending' && status !== 'challenge') throw appError(409, 'Pembayaran sudah diproses, tidak bisa dibatalkan.', 'CONFLICT')
    const [updated] = await getDb().update(paymentSimulations).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(paymentSimulations.id, row.id)).returning()
    return { ...normalize(updated!), alreadyCancelled: false }
  },
  async getStatus(_creds, orderId) {
    assertAllowed()
    return normalize(await load(orderId))
  },

  verifyWebhook: () => false,
  normalizeWebhook: () => {
    throw appError(500, 'Callback simulator selalu dibaca ulang.', 'SERVER_ERROR')
  },
  webhookOrderId: p => str(p.order_id),
  webhookDedupeSource: p => [p.order_id, p.transaction_status, p.transaction_id].map(v => String(v ?? '')).join(':'),
  webhookStatus: p => str(p.transaction_status),
  redirectOrderId: q => str(q.reference ?? q.order_id)
}
