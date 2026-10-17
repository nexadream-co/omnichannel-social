import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { SIMULATED_GATEWAY_WORDS, type PaymentStatusValue } from '../../shared/utils/payments'
import type { CoreContext } from './context'
import { paymentSimulations, payments } from './db/schema'
import { appError } from './errors'
import { receivePaymentWebhook } from './payment-webhooks'
import { simulatorAllowed } from './services/payments/simulator'

type Ctx = Pick<CoreContext, 'db' | 'log' | 'defer'>

/**
 * The simulated hosted payment page (docs/blueprint/08 §11). Each outcome changes the simulator's record (the
 * "gateway side"), then sends a gateway-style callback through the real receiver, which re-reads the status
 * exactly as it would from the hub. "paid_no_callback" skips the callback to exercise reconciliation.
 */
export const SIMULATOR_OUTCOMES = ['paid', 'paid_no_callback', 'challenge', 'failed', 'expired', 'cancelled', 'refunded'] as const
export type SimulatorOutcome = (typeof SIMULATOR_OUTCOMES)[number]
export const outcomeSchema = z.object({ outcome: z.enum(SIMULATOR_OUTCOMES), paymentType: z.enum(['qris', 'gopay', 'shopeepay', 'bank_transfer', 'credit_card']).default('qris') })

const ALLOWED_FROM: Record<SimulatorOutcome, PaymentStatusValue[]> = {
  paid: ['pending', 'challenge'],
  paid_no_callback: ['pending', 'challenge'],
  challenge: ['pending'],
  failed: ['pending', 'challenge'],
  expired: ['pending'],
  cancelled: ['pending', 'challenge'],
  refunded: ['paid']
}

function assertAllowed() {
  if (!simulatorAllowed()) throw appError(404, 'Halaman tidak ditemukan.', 'NOT_FOUND')
}

async function load(ctx: Ctx, orderId: string) {
  const [row] = await ctx.db.select().from(paymentSimulations).where(eq(paymentSimulations.orderId, orderId)).limit(1)
  if (!row) throw appError(404, 'Pembayaran simulasi tidak ditemukan.', 'NOT_FOUND')
  return row
}

/** What the simulated page shows: the charge, its state, and which outcomes are possible from here. */
export async function getSimulatedCharge(ctx: Ctx, orderId: string) {
  assertAllowed()
  const row = await load(ctx, orderId)
  const status = row.status === 'pending' && row.expiresAt && row.expiresAt <= new Date() ? 'expired' : row.status
  const [app] = await ctx.db.select({ status: payments.status }).from(payments).where(eq(payments.orderId, orderId)).limit(1)
  return {
    orderId: row.orderId, gatewayOrderId: row.gatewayOrderId, amount: row.amount, currency: row.currency, itemName: row.itemName, customerName: row.customerName,
    status, appStatus: app?.status ?? null, expiresAt: row.expiresAt, finishUrl: row.finishUrl,
    outcomes: SIMULATOR_OUTCOMES.filter(outcome => ALLOWED_FROM[outcome].includes(status))
  }
}

export async function simulateOutcome(ctx: Ctx, orderId: string, input: z.infer<typeof outcomeSchema>) {
  assertAllowed()
  const row = await load(ctx, orderId)
  const current = row.status === 'pending' && row.expiresAt && row.expiresAt <= new Date() ? 'expired' : row.status
  if (!ALLOWED_FROM[input.outcome].includes(current)) throw appError(409, 'Hasil ini tidak bisa dipilih untuk status pembayaran sekarang.', 'CONFLICT', { from: current })
  const status: PaymentStatusValue = input.outcome === 'paid_no_callback' ? 'paid' : input.outcome
  await ctx.db.update(paymentSimulations).set({
    status, paymentType: status === 'paid' ? input.paymentType : row.paymentType,
    settledAt: status === 'paid' ? new Date() : row.settledAt, updatedAt: new Date()
  }).where(eq(paymentSimulations.id, row.id))

  let callback: { received: boolean, applied?: boolean, duplicate?: boolean } | null = null
  if (input.outcome !== 'paid_no_callback') {
    // The gateway's raw, unsigned payload: the receiver must not trust it and re-reads the status instead.
    callback = await receivePaymentWebhook(ctx, 'simulator', {
      order_id: row.gatewayOrderId, transaction_status: SIMULATED_GATEWAY_WORDS[status], transaction_id: randomBytes(8).toString('hex'),
      gross_amount: String(row.amount), payment_type: status === 'paid' ? input.paymentType : null
    }, { 'user-agent': 'socialz-payment-simulator' })
  }
  // The return redirect carries display-only parameters, like the hub's (the billing page re-reads its own record).
  const back = row.finishUrl ? new URL(row.finishUrl) : null
  if (back) {
    back.searchParams.set('reference', row.orderId)
    back.searchParams.set('result', status === 'paid' ? 'finish' : status === 'challenge' ? 'pending' : 'error')
  }
  return { status, callback, redirectUrl: input.outcome === 'refunded' ? null : back?.toString() ?? null }
}
