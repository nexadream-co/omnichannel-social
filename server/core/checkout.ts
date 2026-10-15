import { randomBytes } from 'node:crypto'
import { and, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { recordAudit } from './audit'
import { assertAbility, type WorkspaceContext } from './context'
import { payments, plans, subscriptions, users } from './db/schema'
import { env } from './env'
import { appError } from './errors'
import { toRupiah } from './money'
import { applyPayment } from './payment-apply'
import { getActiveGateway, getGatewayCredentials, getPaymentDriver, isSupportedProvider, requireActiveGateway } from './services/payments'
import { assertNotImpersonating } from './subscriptions'

export const checkoutSchema = z.object({ planSlug: z.string().min(1), period: z.enum(['monthly', 'yearly']).default('monthly') })

const CHECKOUT_TTL_MS = 60 * 60_000

/** SZ-<time base36>-<4 random>: ≤ 39 chars, the hub's reference alphabet. */
export function generateOrderId(now: number = Date.now()): string {
  const random = Array.from(randomBytes(4), b => (b % 36).toString(36)).join('')
  return `SZ-${now.toString(36)}-${random}`.toUpperCase()
}

/** docs/blueprint/07 §3. The same plan asked for twice is one charge. */
export async function startCheckout(ctx: WorkspaceContext, input: z.infer<typeof checkoutSchema>) {
  assertAbility(ctx, 'billing.manage')
  assertNotImpersonating(ctx)
  const [plan] = await ctx.db.select().from(plans).where(and(eq(plans.slug, input.planSlug), eq(plans.isActive, true))).limit(1)
  if (!plan) throw appError(404, 'Paket tidak ditemukan.', 'NOT_FOUND')
  const amount = toRupiah(input.period === 'yearly' ? plan.priceYearly : plan.priceMonthly)
  if (amount <= 0) throw appError(400, 'Paket ini gratis, tidak perlu pembayaran.', 'VALIDATION_FAILED')
  const { driver, creds } = requireActiveGateway(await getActiveGateway(ctx.db))

  const now = new Date()
  const [reusable] = await ctx.db.select().from(payments).where(and(
    eq(payments.workspaceId, ctx.workspaceId), inArray(payments.status, ['pending', 'challenge']), eq(payments.planSlug, plan.slug),
    eq(payments.period, input.period), eq(payments.provider, driver.provider), isNotNull(payments.redirectUrl),
    or(isNull(payments.expiresAt), gt(payments.expiresAt, now))
  )).limit(1)
  if (reusable) return { orderId: reusable.orderId, redirectUrl: reusable.redirectUrl!, amount: reusable.amount, expiresAt: reusable.expiresAt, reused: true }

  const [user] = ctx.userId ? await ctx.db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, ctx.userId)).limit(1) : []
  const [sub] = await ctx.db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId)).limit(1)
  const orderId = generateOrderId()
  const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS)
  const site = env().siteUrl
  const charge = await driver.createCharge(creds, {
    orderId, amount, currency: 'IDR',
    itemName: `Socialz.id ${plan.name} — ${input.period === 'yearly' ? 'Tahunan' : 'Bulanan'}`,
    customer: { name: user?.name ?? 'Kreator', email: user?.email ?? null, phone: user?.phone ?? null },
    successUrl: `${site}/app/billing?status=success&order_id=${orderId}`,
    failureUrl: `${site}/app/billing?status=failed&order_id=${orderId}`,
    expiresAt,
    metadata: { workspaceId: ctx.workspaceId, planSlug: plan.slug, period: input.period }
  })
  await ctx.db.insert(payments).values({
    workspaceId: ctx.workspaceId, subscriptionId: sub?.id ?? null, orderId, gatewayOrderId: charge.gatewayOrderId ?? null, provider: driver.provider,
    amount, currency: 'IDR', status: 'pending', period: input.period, planSlug: plan.slug, redirectUrl: charge.redirectUrl,
    expiresAt: charge.expiresAt ?? expiresAt, raw: charge.raw ?? null
  })
  await recordAudit(ctx, { audience: 'creator', actorId: ctx.userId, impersonatorId: ctx.impersonatorId, action: 'payment.checkout', workspaceId: ctx.workspaceId, targetType: 'payment', targetId: orderId, metadata: { planSlug: plan.slug, period: input.period, amount, userId: ctx.userId } })
  return { orderId, redirectUrl: charge.redirectUrl, amount, expiresAt, reused: false }
}

/** 07 §3.1: replace an unfinished charge. The gateway decides — a charge paid seconds ago stays paid. */
export async function cancelWorkspacePayment(ctx: WorkspaceContext, paymentId: string) {
  assertAbility(ctx, 'billing.manage')
  assertNotImpersonating(ctx)
  const [payment] = await ctx.db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.workspaceId, ctx.workspaceId))).limit(1)
  if (!payment) throw appError(404, 'Pembayaran tidak ditemukan.', 'NOT_FOUND')
  if (payment.status !== 'pending' && payment.status !== 'challenge') throw appError(409, 'Pembayaran ini sudah diproses.', 'CONFLICT')
  const creds = isSupportedProvider(payment.provider) ? await getGatewayCredentials(payment.provider, ctx.db) : null
  let alreadyCancelled = false
  let status: string = 'cancelled'
  if (creds) {
    const result = await getPaymentDriver(payment.provider).cancelCharge(creds, payment.orderId)
    alreadyCancelled = result.alreadyCancelled
    status = result.status
    await applyPayment(ctx, result)
  } else {
    await ctx.db.update(payments).set({ status: 'cancelled', rawStatus: 'cancelled_locally', updatedAt: new Date() }).where(eq(payments.id, payment.id))
  }
  await recordAudit(ctx, { audience: 'creator', actorId: ctx.userId, impersonatorId: ctx.impersonatorId, action: 'payment.cancel', workspaceId: ctx.workspaceId, targetType: 'payment', targetId: payment.orderId, metadata: { userId: ctx.userId } })
  return { success: true, orderId: payment.orderId, status, alreadyCancelled }
}
