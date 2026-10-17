import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { listGateways, updateGateway } from '../../server/core/admin/billing'
import { shiftTestClock } from '../../server/core/admin/workspaces'
import { cancelWorkspacePayment, startCheckout } from '../../server/core/checkout'
import type { StaffContext, WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { notifications, paymentGateways, paymentSimulations, paymentWebhookEvents, payments, plans, subscriptionEvents, subscriptions, users } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { reconcilePendingPayments } from '../../server/core/payment-reconcile'
import { getSimulatedCharge, simulateOutcome } from '../../server/core/payment-simulator'
import { provisionWorkspace } from '../../server/core/registration'
import { getActiveGateway } from '../../server/core/services/payments'
import { transitionSubscription } from '../../server/core/subscriptions'
import { PERMISSION_KEYS } from '../../shared/utils/permissions'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
const staff = (): StaffContext => ({ ...testContext(), staffUserId: 's', staffName: 'Admin', permissions: new Set(PERMISSION_KEYS), isSuperAdmin: true, impersonatorId: null })
const sub = async () => (await getDb().select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId)))[0]!
const payment = async (orderId: string) => (await getDb().select().from(payments).where(eq(payments.orderId, orderId)))[0]!
const checkout = () => startCheckout(ctx, { planSlug: 'kreator', period: 'monthly' })

function setAppEnv(value: string) {
  process.env.NUXT_PUBLIC_APP_ENV = value
  resetEnvCache()
}

beforeAll(async () => {
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  setAppEnv('test')
  await truncate('payment_simulations', 'payment_webhook_events', 'payments', 'payment_gateways', 'notifications', 'jobs', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'audit_logs')
  await getDb().insert(paymentGateways).values([
    { id: 'gateway-nexadream_hub', provider: 'nexadream_hub', label: 'Hub', isActive: false, isSandbox: false, baseUrl: 'https://nexadream.id' },
    { id: 'gateway-simulator', provider: 'simulator', label: 'Simulator pembayaran', isActive: true, isSandbox: true }
  ])
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
})
afterEach(() => setAppEnv('test'))
afterAll(closeDb)

describe('payment simulator (test mode)', () => {
  it('needs no key: checkout opens the simulated page, and "paid" goes through the real callback + status re-read', async () => {
    const { orderId, redirectUrl } = await checkout()
    expect(redirectUrl).toMatch(new RegExp(`/pay/simulator/${orderId}$`))
    const page = await getSimulatedCharge(testContext(), orderId)
    expect(page).toMatchObject({ amount: 49_000, status: 'pending', appStatus: 'pending', gatewayOrderId: `SIM-${orderId}` })
    expect(page.outcomes).toEqual(['paid', 'paid_no_callback', 'challenge', 'failed', 'expired', 'cancelled'])

    const result = await simulateOutcome(testContext(), orderId, { outcome: 'paid', paymentType: 'gopay' })
    expect(result.redirectUrl).toContain('reference=')
    expect(await payment(orderId)).toMatchObject({ status: 'paid', rawStatus: 'settlement', paymentType: 'gopay', gatewayOrderId: `SIM-${orderId}` })
    expect((await sub()).status).toBe('active')
    expect((await getDb().select().from(paymentWebhookEvents))[0]).toMatchObject({ provider: 'simulator', orderId: `SIM-${orderId}`, error: null })
    expect((await getSimulatedCharge(testContext(), orderId)).outcomes).toEqual(['refunded'])
  })

  it('a lost callback is picked up by reconciliation', async () => {
    const { orderId } = await checkout()
    await simulateOutcome(testContext(), orderId, { outcome: 'paid_no_callback', paymentType: 'qris' })
    expect((await payment(orderId)).status).toBe('pending')
    expect(await reconcilePendingPayments(testContext())).toEqual({ checked: 1, updated: 1 })
    expect((await payment(orderId)).status).toBe('paid')
    expect((await sub()).status).toBe('active')
  })

  it('challenge holds the plan until it settles; failed and expired never start grace for a paid-up plan', async () => {
    const first = await checkout()
    await simulateOutcome(testContext(), first.orderId, { outcome: 'challenge', paymentType: 'credit_card' })
    expect((await payment(first.orderId)).status).toBe('challenge')
    expect((await sub()).status).toBe('trialing')
    await simulateOutcome(testContext(), first.orderId, { outcome: 'paid', paymentType: 'credit_card' })
    expect((await sub()).status).toBe('active')

    const early = await startCheckout(ctx, { planSlug: 'kreator', period: 'yearly' })
    await simulateOutcome(testContext(), early.orderId, { outcome: 'failed', paymentType: 'qris' })
    expect((await payment(early.orderId)).status).toBe('failed')
    expect((await sub()).status).toBe('active')
  })

  it('an unpaid checkout that times out reads as expired; cancelling asks the simulator and refuses once settled', async () => {
    const { orderId } = await checkout()
    await getDb().update(paymentSimulations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(paymentSimulations.orderId, orderId))
    expect((await getSimulatedCharge(testContext(), orderId)).status).toBe('expired')
    await reconcilePendingPayments(testContext())
    expect((await payment(orderId)).status).toBe('expired')

    const second = await startCheckout(ctx, { planSlug: 'kreator', period: 'yearly' })
    const [row] = await getDb().select().from(payments).where(eq(payments.orderId, second.orderId))
    expect(await cancelWorkspacePayment(ctx, row!.id)).toMatchObject({ status: 'cancelled', alreadyCancelled: false })
    await expect(simulateOutcome(testContext(), second.orderId, { outcome: 'paid', paymentType: 'qris' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('refund updates the payment and keeps the plan (refunds are a support decision)', async () => {
    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    const { orderId } = await checkout()
    await simulateOutcome(testContext(), orderId, { outcome: 'paid', paymentType: 'qris' })
    await simulateOutcome(testContext(), orderId, { outcome: 'refunded', paymentType: 'qris' })
    expect((await payment(orderId)).status).toBe('refunded')
    expect((await sub()).status).toBe('active')
  })

  it('does not exist in production: hidden, not activatable, not usable, page 404', async () => {
    const { orderId } = await checkout()
    setAppEnv('production')
    expect(await getActiveGateway()).toBeNull()
    await expect(checkout()).rejects.toMatchObject({ statusCode: 503 })
    await expect(getSimulatedCharge(testContext(), orderId)).rejects.toMatchObject({ statusCode: 404 })
    expect((await listGateways(staff())).items.map(g => g.provider)).toEqual(['nexadream_hub'])
    await expect(updateGateway(staff(), 'gateway-simulator', { isActive: true })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('simulated time walks a subscription through trial end, renewal reminder, grace and downgrade', async () => {
    const id = ctx.workspaceId
    expect(await shiftTestClock(staff(), id, 'end_trial')).toEqual({ before: 'trialing', after: 'downgraded' })
    await transitionSubscription({ workspaceId: id, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    await getDb().delete(notifications)
    await shiftTestClock(staff(), id, 'renewal_in_3_days')
    expect((await getDb().select().from(notifications)).map(n => n.title)).toEqual(['Paket Kreator berakhir 3 hari lagi'])
    expect(await shiftTestClock(staff(), id, 'end_period')).toEqual({ before: 'active', after: 'past_due' })
    expect(await shiftTestClock(staff(), id, 'end_grace')).toEqual({ before: 'past_due', after: 'downgraded' })
    await expect(shiftTestClock(staff(), id, 'end_grace')).rejects.toMatchObject({ statusCode: 409 })
    expect((await getDb().select().from(subscriptionEvents).where(eq(subscriptionEvents.transition, 'test_clock')))).toHaveLength(4)
    setAppEnv('production')
    await expect(shiftTestClock(staff(), id, 'end_trial')).rejects.toMatchObject({ statusCode: 404 })
  })
})
