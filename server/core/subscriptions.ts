import { and, asc, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { isAwaitingPayment } from '../../shared/utils/payments'
import { recordAudit } from './audit'
import { assertAbility, type CoreContext, type WorkspaceContext } from './context'
import type { Executor } from './db/client'
import { getDb } from './db/client'
import { bioPages, dmRules, jobs, payments, plans, postTargets, socialAccounts, subscriptionEvents, subscriptions, workspaces } from './db/schema'
import { getEntitlements, invalidateEntitlements } from './entitlements'
import { appError } from './errors'
import { notifyWorkspaceOwners } from './notifications'
import { getSetting, getSettingNumber } from './settings'
import { getActiveGateway, getPaymentDriver } from './services/payments'

export type SubscriptionStatus = typeof subscriptions.$inferSelect['status']
export type SubscriptionRow = typeof subscriptions.$inferSelect
export type SubscriptionTransition = 'start_trial' | 'pay' | 'payment_failed' | 'grace_expired' | 'trial_expired' | 'cancel' | 'resume' | 'suspend' | 'reinstate'

/** docs/blueprint/07 §1.1. */
const ALLOWED: Record<SubscriptionTransition, SubscriptionStatus[]> = {
  start_trial: ['downgraded', 'cancelled'],
  pay: ['trialing', 'active', 'past_due', 'cancelled', 'downgraded'],
  payment_failed: ['active', 'trialing', 'past_due'],
  grace_expired: ['past_due', 'cancelled'],
  trial_expired: ['trialing'],
  cancel: ['trialing', 'active', 'past_due'],
  resume: ['cancelled'],
  suspend: ['trialing', 'active', 'past_due', 'cancelled', 'downgraded'],
  reinstate: ['suspended']
}

export interface TransitionInput {
  workspaceId: string
  transition: SubscriptionTransition
  planSlug?: string
  period?: 'monthly' | 'yearly'
  reason?: string
  force?: boolean
  tx?: Executor
  now?: Date
}

/** addMonths in UTC, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function periodEnd(from: Date, period: 'monthly' | 'yearly'): Date {
  const months = period === 'yearly' ? 12 : 1
  const d = new Date(from)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

/** A failed/expired charge enters grace only when the paid time has actually run out (07 §1.2). */
export function isSubscriptionDue(s: Pick<SubscriptionRow, 'status' | 'trialEndsAt' | 'currentPeriodEnd'>, now: Date = new Date()): boolean {
  switch (s.status) {
    case 'trialing': return !s.trialEndsAt || s.trialEndsAt <= now
    case 'active': return !s.currentPeriodEnd || s.currentPeriodEnd <= now
    case 'past_due': return true
    default: return false
  }
}

async function planBySlug(db: Executor, slug: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.slug, slug)).limit(1)
  if (!plan) throw appError(404, 'Paket tidak ditemukan.', 'NOT_FOUND')
  return plan
}

/**
 * The ONLY writer of subscriptions.status (CLAUDE.md rule 5). Every call appends a subscription_events row
 * in the same client and bumps the entitlements version.
 */
export async function transitionSubscription(input: TransitionInput): Promise<SubscriptionRow> {
  const db = input.tx ?? getDb()
  const now = input.now ?? new Date()
  const [current] = await db.select({ sub: subscriptions, planSlug: plans.slug }).from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.workspaceId, input.workspaceId)).for('update').limit(1)
  if (!current) throw appError(404, 'Langganan tidak ditemukan.', 'NOT_FOUND')
  const sub = current.sub
  if (!input.force && !ALLOWED[input.transition].includes(sub.status)) {
    throw appError(409, 'Perubahan paket ini tidak bisa dilakukan sekarang.', 'CONFLICT', { from: sub.status, transition: input.transition })
  }

  let set: Partial<typeof subscriptions.$inferInsert> = {}
  let planSlug = current.planSlug
  switch (input.transition) {
    case 'start_trial': {
      planSlug = input.planSlug ?? await getSetting('billing.trialPlanSlug', db)
      const plan = await planBySlug(db, planSlug)
      set = { planId: plan.id, status: 'trialing', trialEndsAt: new Date(now.getTime() + plan.trialDays * 86_400_000), graceEndsAt: null, downgradedAt: null, cancelledAt: null }
      break
    }
    case 'pay': {
      planSlug = input.planSlug ?? current.planSlug
      const plan = await planBySlug(db, planSlug)
      const period = input.period ?? sub.period
      // Renewing early stacks onto the remaining time; only a paid period counts (not a trial).
      const paidUntil = sub.currentPeriodEnd && sub.currentPeriodEnd > now && ['active', 'cancelled', 'past_due'].includes(sub.status) ? sub.currentPeriodEnd : now
      set = { planId: plan.id, period, status: 'active', currentPeriodEnd: periodEnd(paidUntil, period), graceEndsAt: null, trialEndsAt: null, cancelledAt: null, downgradedAt: null }
      break
    }
    case 'payment_failed': {
      const days = Math.max(0, Math.trunc(await getSettingNumber('billing.gracePeriodDays', 3, db)))
      set = { status: 'past_due', graceEndsAt: new Date(now.getTime() + days * 86_400_000) }
      break
    }
    case 'trial_expired':
    case 'grace_expired': {
      planSlug = await getSetting('billing.defaultPlanSlug', db)
      const plan = await planBySlug(db, planSlug)
      set = { planId: plan.id, status: 'downgraded', downgradedAt: now, graceEndsAt: null, trialEndsAt: null, currentPeriodEnd: null, cancelledAt: null }
      break
    }
    case 'cancel':
      set = { status: 'cancelled', cancelledAt: now }
      break
    case 'resume':
      set = { status: sub.currentPeriodEnd && sub.currentPeriodEnd > now ? 'active' : 'trialing', cancelledAt: null }
      break
    case 'suspend':
      set = { status: 'suspended' }
      break
    case 'reinstate':
      set = { status: sub.currentPeriodEnd && sub.currentPeriodEnd > now ? 'active' : 'downgraded' }
      break
  }

  const [row] = await db.update(subscriptions).set({ ...set, updatedAt: now }).where(eq(subscriptions.id, sub.id)).returning()
  await db.insert(subscriptionEvents).values({
    workspaceId: input.workspaceId, transition: input.transition, fromStatus: sub.status, toStatus: row!.status,
    fromPlanSlug: current.planSlug, toPlanSlug: planSlug, period: row!.period
  })
  await invalidateEntitlements(input.workspaceId, db)
  return row!
}

/**
 * After a downgrade (07 §6): keep the oldest accounts/rules/Etalase within the plan, deactivate the rest.
 * Nothing is deleted; the owner picks which accounts stay on /app/accounts. One transaction.
 */
export async function enforceWorkspaceLimits(ctx: Pick<CoreContext, 'db' | 'log' | 'defer'>, workspaceId: string) {
  const { limits } = await getEntitlements(workspaceId, undefined, ctx.db)
  const result = { accountsDisabled: 0, rulesPaused: 0, pagesUnpublished: 0, postsToDraft: 0 }
  const disabledNames: string[] = []
  const pausedNames: string[] = []
  await ctx.db.transaction(async (tx) => {
    if (limits.socialAccounts !== -1) {
      const live = await tx.select({ id: socialAccounts.id, username: socialAccounts.username, platform: socialAccounts.platform }).from(socialAccounts)
        .where(and(eq(socialAccounts.workspaceId, workspaceId), inArray(socialAccounts.status, ['active', 'needs_reauth']))).orderBy(asc(socialAccounts.createdAt))
      disabledNames.push(...live.slice(limits.socialAccounts).map(a => a.username ?? a.platform))
      const excess = live.slice(limits.socialAccounts).map(a => a.id)
      if (excess.length) {
        await tx.update(socialAccounts).set({ status: 'disabled', updatedAt: new Date() }).where(inArray(socialAccounts.id, excess))
        result.accountsDisabled = excess.length
        // Scheduled posts on disabled accounts go back to drafts; their queued jobs are cancelled.
        const targets = await tx.update(postTargets).set({ status: 'draft', updatedAt: new Date() })
          .where(and(inArray(postTargets.socialAccountId, excess), eq(postTargets.status, 'scheduled'))).returning({ id: postTargets.id })
        result.postsToDraft = targets.length
        if (targets.length) {
          await tx.update(jobs).set({ status: 'cancelled', finishedAt: new Date() })
            .where(and(eq(jobs.status, 'queued'), sql`${jobs.payload}->>'postTargetId' in (${sql.join(targets.map(t => sql`${t.id}`), sql`, `)})`))
        }
      }
    }
    if (limits.autoReplyRules !== -1) {
      const rules = await tx.select({ id: dmRules.id, name: dmRules.name }).from(dmRules)
        .innerJoin(socialAccounts, eq(socialAccounts.id, dmRules.socialAccountId))
        .where(and(eq(dmRules.workspaceId, workspaceId), eq(dmRules.active, true)))
        .orderBy(sql`case when ${socialAccounts.status} = 'active' then 0 else 1 end`, asc(dmRules.createdAt))
      pausedNames.push(...rules.slice(limits.autoReplyRules).map(r => r.name))
      const excess = rules.slice(limits.autoReplyRules).map(r => r.id)
      if (excess.length) {
        await tx.update(dmRules).set({ active: false, pausedReason: 'plan_limit', updatedAt: new Date() }).where(inArray(dmRules.id, excess))
        result.rulesPaused = excess.length
      }
    }
    if (limits.bioPages !== -1) {
      const pages = await tx.select({ id: bioPages.id }).from(bioPages)
        .where(and(eq(bioPages.workspaceId, workspaceId), eq(bioPages.published, true))).orderBy(asc(bioPages.createdAt))
      const excess = pages.slice(limits.bioPages).map(p => p.id)
      if (excess.length) {
        await tx.update(bioPages).set({ published: false, updatedAt: new Date() }).where(inArray(bioPages.id, excess))
        result.pagesUnpublished = excess.length
      }
    }
    // The flag that opens "Pilih akun yang tetap aktif" lands with the deactivation it asks about.
    await tx.update(workspaces).set({ downgradeResolvedAt: null }).where(eq(workspaces.id, workspaceId))
  })
  await invalidateEntitlements(workspaceId, ctx.db)
  const [info] = await ctx.db.select({ planName: plans.name, workspaceName: workspaces.name }).from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId)).innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId)).where(eq(subscriptions.workspaceId, workspaceId))
  await notifyWorkspaceOwners(ctx, workspaceId, {
    templateKey: 'subscription_downgraded',
    dedupeKey: `subscription_downgraded:${workspaceId}:${new Date().toISOString().slice(0, 10)}`,
    variables: {
      planName: info?.planName ?? 'Gratis', workspaceName: info?.workspaceName ?? '', accountSelectionUrl: '/app/accounts',
      disabledAccounts: disabledNames.join(', '), pausedRules: pausedNames.join(', ')
    }
  })
  return result
}

/** downgradeResolvedAt null AND more connected accounts than the plan allows (07 §6). */
export async function needsAccountSelection(db: Executor, workspaceId: string): Promise<boolean> {
  const [ws] = await db.select({ resolved: workspaces.downgradeResolvedAt }).from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws || ws.resolved) return false
  const { limits } = await getEntitlements(workspaceId, undefined, db)
  if (limits.socialAccounts === -1) return false
  const [row] = await db.select({ n: count() }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), notInArray(socialAccounts.status, ['revoked'])))
  return (row?.n ?? 0) > limits.socialAccounts
}

export async function selectActiveAccounts(ctx: WorkspaceContext, socialAccountIds: string[]) {
  assertAbility(ctx, 'accounts.manage')
  const ids = [...new Set(socialAccountIds)]
  const { limits } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  if (limits.socialAccounts !== -1 && ids.length > limits.socialAccounts) {
    throw appError(402, `Paketmu bisa memakai ${limits.socialAccounts} akun. Pilih ${limits.socialAccounts} saja.`, 'LIMIT_REACHED', { limit: 'socialAccounts', max: limits.socialAccounts })
  }
  const all = await ctx.db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, ctx.workspaceId), notInArray(socialAccounts.status, ['revoked'])))
  if (ids.some(id => !all.find(a => a.id === id))) throw appError(404, 'Akun tidak ditemukan.', 'NOT_FOUND')
  await ctx.db.transaction(async (tx) => {
    for (const account of all) {
      const chosen = ids.includes(account.id)
      const tokenOk = !account.tokenExpiresAt || account.tokenExpiresAt > new Date()
      const status = chosen ? (account.status === 'disabled' ? (tokenOk ? 'active' : 'needs_reauth') : account.status) : 'disabled'
      if (status !== account.status) await tx.update(socialAccounts).set({ status, updatedAt: new Date() }).where(eq(socialAccounts.id, account.id))
    }
    await tx.update(workspaces).set({ downgradeResolvedAt: new Date() }).where(eq(workspaces.id, ctx.workspaceId))
  })
  await invalidateEntitlements(ctx.workspaceId, ctx.db)
  return { ok: true }
}

export function assertNotImpersonating(ctx: Pick<WorkspaceContext, 'impersonatorId'>) {
  if (ctx.impersonatorId) throw appError(403, 'Tindakan ini tidak bisa dilakukan saat menyamar sebagai pengguna.', 'FORBIDDEN')
}

export async function cancelSubscription(ctx: WorkspaceContext) {
  assertAbility(ctx, 'billing.manage')
  assertNotImpersonating(ctx)
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId)).limit(1)
  if (sub?.providerRef && sub.provider) {
    const gateway = await getActiveGateway(ctx.db)
    if (gateway && gateway.creds.provider === sub.provider) {
      await getPaymentDriver(sub.provider).cancelSubscription(gateway.creds, sub.providerRef).catch(error => ctx.log.warn('subscription.cancel_mandate_failed', { error }))
    }
  }
  const row = await transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'cancel' })
  await recordAudit(ctx, { audience: 'creator', actorId: ctx.userId, impersonatorId: ctx.impersonatorId, action: 'subscription.downgrade', workspaceId: ctx.workspaceId, targetType: 'subscription', targetId: row.id, metadata: { cancelledBy: 'owner', userId: ctx.userId } })
  return row
}

export async function resumeSubscription(ctx: WorkspaceContext) {
  assertAbility(ctx, 'billing.manage')
  assertNotImpersonating(ctx)
  return transitionSubscription({ workspaceId: ctx.workspaceId, transition: 'resume' })
}

const paymentView = (p: typeof payments.$inferSelect) => ({
  id: p.id, orderId: p.orderId, amount: p.amount, currency: p.currency, status: p.status, planSlug: p.planSlug, period: p.period,
  paymentType: p.paymentType, redirectUrl: isAwaitingPayment(p) ? p.redirectUrl : null, paidAt: p.paidAt, expiresAt: p.expiresAt, createdAt: p.createdAt
})

/** GET /api/app/subscription (07 §3.2). The gateway name and credentials never leave the server. */
export async function getSubscriptionView(ctx: WorkspaceContext) {
  assertAbility(ctx, 'billing.manage')
  const [[row], planRows, pending, entitlements, gateway, selection] = await Promise.all([
    ctx.db.select({ sub: subscriptions, plan: plans }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.workspaceId, ctx.workspaceId)).limit(1),
    ctx.db.select().from(plans).where(and(eq(plans.isActive, true), eq(plans.isPublic, true))).orderBy(asc(plans.order)),
    ctx.db.select().from(payments).where(and(eq(payments.workspaceId, ctx.workspaceId), inArray(payments.status, ['pending', 'challenge']))).orderBy(desc(payments.createdAt)),
    getEntitlements(ctx.workspaceId, undefined, ctx.db),
    getActiveGateway(ctx.db).catch(() => null),
    needsAccountSelection(ctx.db, ctx.workspaceId)
  ])
  if (!row) throw appError(404, 'Langganan tidak ditemukan.', 'NOT_FOUND')
  const reminderDays = Math.max(...(await getSetting('billing.renewalReminderDays', ctx.db)).split(',').map(Number).filter(Number.isFinite), 7)
  return {
    subscription: {
      status: row.sub.status, period: row.sub.period, trialEndsAt: row.sub.trialEndsAt, currentPeriodEnd: row.sub.currentPeriodEnd,
      graceEndsAt: row.sub.graceEndsAt, cancelledAt: row.sub.cancelledAt,
      plan: { slug: row.plan.slug, name: row.plan.name, priceMonthly: row.plan.priceMonthly, priceYearly: row.plan.priceYearly }
    },
    effectivePlan: { slug: entitlements.effectivePlanSlug, name: entitlements.planName },
    renewalReminderDays: reminderDays,
    plans: planRows.map(p => ({ slug: p.slug, name: p.name, description: p.description, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, limits: p.limits, features: p.features, trialDays: p.trialDays })),
    pendingPayments: pending.filter(p => isAwaitingPayment(p)).map(paymentView),
    needsAccountSelection: selection,
    checkoutAvailable: Boolean(gateway),
    // Test mode: payments are simulated (docs/blueprint/08 §11); the page says so plainly.
    testMode: gateway?.driver.provider === 'simulator'
  }
}

export async function listWorkspacePayments(ctx: WorkspaceContext, query: { page: number, limit: number }) {
  assertAbility(ctx, 'billing.manage')
  const where = eq(payments.workspaceId, ctx.workspaceId)
  const [items, [total]] = await Promise.all([
    ctx.db.select().from(payments).where(where).orderBy(desc(payments.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(payments).where(where)
  ])
  const n = total?.n ?? 0
  return { items: items.map(paymentView), meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) } }
}

/** The return page reads the payment's own status (the redirect URL is not proof of payment). */
export async function getWorkspacePayment(ctx: WorkspaceContext, orderId: string) {
  assertAbility(ctx, 'billing.manage')
  const [row] = await ctx.db.select().from(payments).where(and(eq(payments.workspaceId, ctx.workspaceId), eq(payments.orderId, orderId))).limit(1)
  if (!row) throw appError(404, 'Pembayaran tidak ditemukan.', 'NOT_FOUND')
  return paymentView(row)
}
