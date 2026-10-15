import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { billingDailyJob, renewalRemindersJob } from '../../server/core/billing-jobs'
import { cancelWorkspacePayment, startCheckout } from '../../server/core/checkout'
import type { WorkspaceContext } from '../../server/core/context'
import { encrypt } from '../../server/core/crypto'
import { closeDb, getDb } from '../../server/core/db/client'
import { notifications, paymentGateways, paymentWebhookEvents, payments, plans, socialAccounts, subscriptionEvents, subscriptions, users, workspaces } from '../../server/core/db/schema'
import { getEntitlements } from '../../server/core/entitlements'
import { resetEnvCache } from '../../server/core/env'
import type { ClaimedJob } from '../../server/core/jobs'
import { reconcilePendingPayments } from '../../server/core/payment-reconcile'
import { receivePaymentWebhook } from '../../server/core/payment-webhooks'
import { provisionWorkspace } from '../../server/core/registration'
import { gatewaySecretAad, registerPaymentDriver, type PaymentDriver } from '../../server/core/services/payments'
import { nexadreamHubDriver } from '../../server/core/services/payments/nexadream-hub'
import { connectAccounts } from '../../server/core/social-accounts'
import { needsAccountSelection, periodEnd, selectActiveAccounts, transitionSubscription } from '../../server/core/subscriptions'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
const DAY = 86_400_000

/** In-memory hub: the real driver's callback parsing, fake HTTP. */
const hub = new Map<string, { status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled', amount: number }>()
const fakeHub: PaymentDriver = {
  ...nexadreamHubDriver,
  async createCharge(_creds, input) {
    hub.set(input.orderId, { status: 'pending', amount: input.amount })
    return { orderId: input.orderId, gatewayOrderId: `TEST-${input.orderId}`, redirectUrl: `https://hub.test/pay/${input.orderId}`, expiresAt: input.expiresAt }
  },
  async getStatus(_creds, orderId) {
    const row = hub.get(orderId)!
    return { orderId, status: row.status, rawStatus: row.status === 'paid' ? 'settlement' : row.status, amount: row.amount, currency: 'IDR', paymentType: 'qris', paidAt: row.status === 'paid' ? new Date() : null }
  },
  async cancelCharge(_creds, orderId) {
    const row = hub.get(orderId)!
    if (row.status === 'pending') row.status = 'cancelled'
    return { orderId, status: row.status, rawStatus: row.status, amount: row.amount, currency: 'IDR', alreadyCancelled: false }
  }
}

const sub = async () => (await getDb().select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId)))[0]!
const job = { id: 'j', queue: 'billing.daily', payload: {}, workspaceId: null, attempts: 1, maxAttempts: 3, runAt: new Date() } as ClaimedJob
async function runDaily() {
  const base = testContext()
  await billingDailyJob(job, base)
  await base.flush()
}
const callback = (orderId: string, status = 'settlement') => receivePaymentWebhook(testContext(), 'nexadream_hub', { order_id: `TEST-${orderId}`, transaction_status: status, transaction_id: `tx-${orderId}-${status}` }, {})
const account = (n: number) => ({ externalId: `acc-${n}`, username: `akun${n}`, avatarUrl: null, accessToken: `t${n}`, refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} })

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  registerPaymentDriver(fakeHub)
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  hub.clear()
  await truncate('payment_webhook_events', 'payments', 'payment_gateways', 'social_accounts', 'dm_rules', 'notifications', 'jobs', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  await getDb().insert(paymentGateways).values({
    id: 'gateway-nexadream_hub', provider: 'nexadream_hub', label: 'Hub', isActive: true, isSandbox: false, baseUrl: 'https://hub.test', orderPrefix: 'TEST',
    serverKey: encrypt('phk_live_test', gatewaySecretAad('nexadream_hub', 'serverKey'))
  })
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
})
afterAll(closeDb)

describe('Nexadream hub driver (HTTP shape)', () => {
  const creds = { provider: 'nexadream_hub', serverKey: 'phk_live_x', clientKey: '', baseUrl: 'https://hub.test/', orderPrefix: 'SOC', isSandbox: false }
  it('creates one line at the full amount and keeps the prefixed id as the gateway order id', async () => {
    let sent: { url: string, body: Record<string, unknown>, auth: string } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization! }
      return new Response(JSON.stringify({ orderId: 'SOC-SZ-1', reference: 'SZ-1', redirectUrl: 'https://pay', status: 'pending' }), { status: 200 })
    }) as unknown as typeof fetch
    const result = await nexadreamHubDriver.createCharge(creds, { orderId: 'SZ-1', amount: 49_000, currency: 'IDR', itemName: 'Socialz.id Kreator — Bulanan', customer: { name: 'Rina' }, successUrl: 's', failureUrl: 'f', expiresAt: new Date(Date.now() + 3_600_000) }, fetchImpl)
    expect(sent!.url).toBe('https://hub.test/api/hub/v1/transactions')
    expect(sent!.auth).toBe('Bearer phk_live_x')
    expect(sent!.body).toMatchObject({ reference: 'SZ-1', amount: 49_000, items: [{ price: 49_000, quantity: 1 }], expiryMinutes: 60 })
    expect(result).toMatchObject({ orderId: 'SZ-1', gatewayOrderId: 'SOC-SZ-1', redirectUrl: 'https://pay' })
  })

  it('normalizes status and maps hub errors to plain messages', async () => {
    const respond = (status: number, body: object) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    const paid = await nexadreamHubDriver.getStatus(creds, 'SZ-1', respond(200, { orderId: 'SOC-SZ-1', status: 'PAID', gatewayStatus: 'settlement', amount: '49000', settlementTime: '2026-10-16T01:00:00Z' }))
    expect(paid).toMatchObject({ orderId: 'SZ-1', status: 'paid', rawStatus: 'settlement', amount: 49_000 })
    expect((await nexadreamHubDriver.getStatus(creds, 'SZ-1', respond(200, { orderId: 'SOC-SZ-1', status: 'weird' }))).status).toBe('pending')
    await expect(nexadreamHubDriver.cancelCharge(creds, 'SZ-1', respond(409, {}))).rejects.toMatchObject({ statusCode: 409 })
    await expect(nexadreamHubDriver.getStatus(creds, 'SZ-1', respond(401, {}))).rejects.toMatchObject({ statusCode: 503 })
  })
})

describe('subscription state machine', () => {
  it('pay stacks onto remaining paid time; illegal transitions are refused; every write appends an event', async () => {
    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    const first = (await sub()).currentPeriodEnd!
    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    expect((await sub()).currentPeriodEnd!.getTime()).toBe(periodEnd(first, 'monthly').getTime())
    await expect(transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'reinstate' })).rejects.toMatchObject({ statusCode: 409 })
    const events = await getDb().select().from(subscriptionEvents).where(eq(subscriptionEvents.workspaceId, ctx.workspaceId))
    expect(events.map(e => e.transition)).toEqual(['signup', 'pay', 'pay'])
  })

  it('periodEnd clamps to the end of shorter months', () => {
    expect(periodEnd(new Date('2026-01-31T05:00:00Z'), 'monthly').toISOString()).toBe('2026-02-28T05:00:00.000Z')
    expect(periodEnd(new Date('2028-02-29T05:00:00Z'), 'yearly').toISOString()).toBe('2029-02-28T05:00:00.000Z')
  })
})

describe('checkout → callback → active', () => {
  it('one charge per plan+period; a callback is only a nudge, the status comes from the hub', async () => {
    const first = await startCheckout(ctx, { planSlug: 'kreator', period: 'monthly' })
    const again = await startCheckout(ctx, { planSlug: 'kreator', period: 'monthly' })
    expect(again).toMatchObject({ orderId: first.orderId, reused: true })
    expect(first.amount).toBe(49_000)

    // The callback says "settlement", but the hub still says pending: nothing is fulfilled.
    expect(await callback(first.orderId)).toMatchObject({ received: true })
    expect((await sub()).status).toBe('trialing')

    hub.get(first.orderId)!.status = 'paid'
    await callback(first.orderId, 'settlement-2')
    const s = await sub()
    expect(s.status).toBe('active')
    expect(s.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY)
    expect((await getDb().select().from(payments))[0]).toMatchObject({ status: 'paid', paymentType: 'qris' })
    expect(await callback(first.orderId, 'settlement-2')).toEqual({ received: true, duplicate: true })
    expect((await getDb().select().from(notifications)).map(n => n.title)).toEqual(['Pembayaran diterima'])
  })

  it('callbacks for another platform on the shared merchant are stored and ignored', async () => {
    expect(await receivePaymentWebhook(testContext(), 'nexadream_hub', { order_id: 'OTHER-123', transaction_status: 'settlement' }, {})).toEqual({ received: true, applied: false })
    expect((await getDb().select().from(paymentWebhookEvents))[0]).toMatchObject({ error: 'unknown order' })
  })

  it('refuses free plans, impersonation, and checkout without an active gateway', async () => {
    await expect(startCheckout(ctx, { planSlug: 'gratis', period: 'monthly' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(startCheckout({ ...ctx, impersonatorId: 'staff-1' }, { planSlug: 'kreator', period: 'monthly' })).rejects.toMatchObject({ statusCode: 403 })
    await getDb().update(paymentGateways).set({ isActive: false })
    await expect(startCheckout(ctx, { planSlug: 'kreator', period: 'monthly' })).rejects.toMatchObject({ statusCode: 503 })
  })

  it('an abandoned early renewal never starts grace; a failed charge once the period ran out does', async () => {
    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    const early = await startCheckout(ctx, { planSlug: 'kreator', period: 'monthly' })
    hub.get(early.orderId)!.status = 'expired'
    await callback(early.orderId, 'expire')
    expect((await sub()).status).toBe('active')

    await getDb().update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - DAY) }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    const late = await startCheckout(ctx, { planSlug: 'kreator', period: 'yearly' })
    hub.get(late.orderId)!.status = 'failed'
    await callback(late.orderId, 'deny')
    expect((await sub())).toMatchObject({ status: 'past_due' })
    expect((await sub()).graceEndsAt!.getTime()).toBeGreaterThan(Date.now() + 2 * DAY)
  })

  it('cancelling an unfinished charge asks the hub; reconcile picks up missed callbacks', async () => {
    const first = await startCheckout(ctx, { planSlug: 'kreator', period: 'monthly' })
    const [row] = await getDb().select().from(payments)
    expect(await cancelWorkspacePayment(ctx, row!.id)).toMatchObject({ status: 'cancelled' })
    expect((await getDb().select().from(payments))[0]!.status).toBe('cancelled')
    await expect(cancelWorkspacePayment(ctx, row!.id)).rejects.toMatchObject({ statusCode: 409 })

    const second = await startCheckout(ctx, { planSlug: 'kreator', period: 'yearly' })
    expect(second.orderId).not.toBe(first.orderId)
    hub.get(second.orderId)!.status = 'paid'
    expect(await reconcilePendingPayments(testContext())).toEqual({ checked: 1, updated: 1 })
    expect((await sub())).toMatchObject({ status: 'active', period: 'yearly' })
  })
})

describe('billing.daily and downgrade enforcement', () => {
  it('a lapsed trial drops to Gratis, excess accounts are disabled (never deleted) and the owner picks', async () => {
    for (let i = 1; i <= 4; i++) await connectAccounts(ctx, 'instagram', [account(i)])
    await getDb().update(subscriptions).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    await runDaily()
    expect((await sub()).status).toBe('downgraded')
    const accounts = await getDb().select().from(socialAccounts).orderBy(socialAccounts.createdAt)
    expect(accounts.map(a => a.status)).toEqual(['active', 'active', 'disabled', 'disabled'])
    expect(await needsAccountSelection(getDb(), ctx.workspaceId)).toBe(true)

    await expect(selectActiveAccounts(ctx, accounts.slice(0, 3).map(a => a.id))).rejects.toMatchObject({ statusCode: 402 })
    await selectActiveAccounts(ctx, [accounts[2]!.id, accounts[3]!.id])
    expect((await getDb().select().from(socialAccounts).orderBy(socialAccounts.createdAt)).map(a => a.status)).toEqual(['disabled', 'disabled', 'active', 'active'])
    expect(await needsAccountSelection(getDb(), ctx.workspaceId)).toBe(false)
    expect((await getEntitlements(ctx.workspaceId)).effectivePlanSlug).toBe('gratis')
  })

  it('an unpaid period enters grace, then grace ends on Gratis; a cancelled plan runs to its end', async () => {
    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    await getDb().update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    await runDaily()
    expect((await sub()).status).toBe('past_due')
    await getDb().update(subscriptions).set({ graceEndsAt: new Date(Date.now() - 1000) }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    await runDaily()
    expect((await sub()).status).toBe('downgraded')

    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'cancel' })
    await runDaily()
    expect((await sub()).status).toBe('cancelled') // still paid up
    await getDb().update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    await runDaily()
    expect((await sub()).status).toBe('downgraded')
  })

  it('renewal reminders fire on the configured days only, once a day', async () => {
    await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    await getDb().update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() + 7 * DAY + 60_000) }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    await getDb().delete(notifications)
    const base = testContext()
    await renewalRemindersJob(job, base)
    await renewalRemindersJob(job, base)
    await base.flush()
    const rows = await getDb().select().from(notifications)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toContain('7 hari')
  })

  it('suspended workspaces are left alone by the daily job', async () => {
    await getDb().update(workspaces).set({ status: 'suspended' }).where(eq(workspaces.id, ctx.workspaceId))
    await getDb().update(subscriptions).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    await runDaily()
    expect((await sub()).status).toBe('trialing')
  })
})
