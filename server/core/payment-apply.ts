import { and, eq } from 'drizzle-orm'
import type { CoreContext } from './context'
import type { Executor } from './db/client'
import { payments, plans, subscriptions, workspaces } from './db/schema'
import { formatIDR } from './money'
import { notifyWorkspaceOwners } from './notifications'
import type { GatewayCredentials, NormalizedPayment, PaymentDriver } from './services/payments'
import { isSubscriptionDue, transitionSubscription } from './subscriptions'

type Ctx = Pick<CoreContext, 'db' | 'log' | 'defer'>

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })

/**
 * For an unverifiable callback (the hub's case), the payload only tells us WHICH order: the truth comes
 * from getStatus (CLAUDE.md rule 6). Matches gatewayOrderId exactly; null = another platform's order.
 */
export async function normalizeCallback(ctx: Ctx, driver: PaymentDriver, creds: GatewayCredentials, payload: Record<string, unknown>): Promise<NormalizedPayment | null> {
  if (driver.trustsWebhookPayload) return driver.normalizeWebhook(payload)
  const gatewayOrderId = driver.webhookOrderId(payload)
  if (!gatewayOrderId) throw new Error('callback carried no order id')
  const [payment] = await ctx.db.select({ orderId: payments.orderId }).from(payments).where(eq(payments.gatewayOrderId, gatewayOrderId)).limit(1)
  if (!payment) return null
  return driver.getStatus(creds, payment.orderId)
}

export type ApplyResult = { applied: boolean, noop?: boolean, reason?: string }

/**
 * docs/blueprint/07 §4. Idempotent. "paid" = row paid + subscription activated in ONE transaction, so a
 * failure leaves the row pending for the next retry/reconcile/replay. Notifications stay outside.
 */
export async function applyPayment(ctx: Ctx, normalized: NormalizedPayment): Promise<ApplyResult> {
  const [payment] = await ctx.db.select().from(payments).where(eq(payments.orderId, normalized.orderId)).limit(1)
  if (!payment) return { applied: false, reason: 'unknown order' }
  if (payment.status === normalized.status) return { applied: false, noop: true }
  if (payment.status === 'paid' && normalized.status !== 'refunded') return { applied: false, noop: true }

  const data = {
    status: normalized.status, rawStatus: normalized.rawStatus.slice(0, 100), paymentType: normalized.paymentType ?? payment.paymentType,
    paidAt: normalized.status === 'paid' ? normalized.paidAt ?? new Date() : payment.paidAt, raw: normalized.raw ?? payment.raw, updatedAt: new Date()
  }

  // Compare-and-set on the status we read: when a callback, a replay and the daily reconcile apply the same
  // payment at once, the row lock makes the others re-check, find the status moved on and change nothing.
  // Without it, two `pay` transitions would each stack a period onto the subscription.
  const claim = (tx: Executor) => tx.update(payments).set(data)
    .where(and(eq(payments.id, payment.id), eq(payments.status, payment.status))).returning({ id: payments.id })

  if (normalized.status === 'paid') {
    const sub = await ctx.db.transaction(async (tx) => {
      if (!(await claim(tx)).length) return null
      return transitionSubscription({ workspaceId: payment.workspaceId, transition: 'pay', planSlug: payment.planSlug ?? undefined, period: payment.period, force: true, tx })
    })
    if (!sub) return { applied: false, noop: true }
    const [[plan], [ws]] = await Promise.all([
      ctx.db.select({ name: plans.name }).from(plans).where(eq(plans.id, sub.planId)),
      ctx.db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, payment.workspaceId))
    ])
    await notifyWorkspaceOwners(ctx, payment.workspaceId, {
      templateKey: 'payment_success',
      dedupeKey: `payment_success:${payment.orderId}`,
      variables: {
        amount: formatIDR(payment.amount), planName: plan?.name ?? '', periodLabel: payment.period === 'yearly' ? 'Tahunan' : 'Bulanan', orderId: payment.orderId,
        periodEnd: sub.currentPeriodEnd ? dateFormat.format(sub.currentPeriodEnd) : '', workspaceName: ws?.name ?? '', billingUrl: '/app/billing'
      }
    })
    return { applied: true }
  }

  if (normalized.status === 'failed' || normalized.status === 'expired') {
    // An abandoned early renewal looks like a default: grace only when the paid time has run out (07 §1.2).
    const graceEndsAt = await ctx.db.transaction(async (tx) => {
      if (!(await claim(tx)).length) return null
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.workspaceId, payment.workspaceId)).for('update').limit(1)
      if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status) || !isSubscriptionDue(sub) || sub.status === 'past_due') return null
      const row = await transitionSubscription({ workspaceId: payment.workspaceId, transition: 'payment_failed', force: true, tx })
      return row.graceEndsAt
    })
    if (graceEndsAt) {
      const [[plan], [ws]] = await Promise.all([
        ctx.db.select({ name: plans.name }).from(plans).where(eq(plans.slug, payment.planSlug ?? '')),
        ctx.db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, payment.workspaceId))
      ])
      await notifyWorkspaceOwners(ctx, payment.workspaceId, {
        templateKey: 'payment_failed',
        dedupeKey: `payment_failed:${payment.orderId}`,
        variables: { amount: formatIDR(payment.amount), planName: plan?.name ?? '', workspaceName: ws?.name ?? '', graceEndsAt: dateFormat.format(graceEndsAt), billingUrl: '/app/billing' }
      })
    }
    return { applied: true }
  }

  if (!(await claim(ctx.db)).length) return { applied: false, noop: true }
  return { applied: true }
}
