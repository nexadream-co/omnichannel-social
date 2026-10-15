import { and, eq, inArray, isNotNull, lte, or, isNull, sql } from 'drizzle-orm'
import type { CoreContext } from './context'
import type { Database } from './db/client'
import { plans, subscriptions, workspaces } from './db/schema'
import type { JobHandler } from './jobs/types'
import { formatIDR, toRupiah } from './money'
import { notifyWorkspaceOwners } from './notifications'
import { reconcilePendingPayments } from './payment-reconcile'
import { getSetting, getSettingNumber } from './settings'
import { enforceWorkspaceLimits, transitionSubscription, type SubscriptionTransition } from './subscriptions'

type Ctx = CoreContext & { db: Database }

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
const wibDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d)
/** Whole calendar days (WIB) from today until `d`. */
const daysUntil = (d: Date, now: Date) => Math.round((Date.parse(wibDay(d)) - Date.parse(wibDay(now))) / 86_400_000)

async function step(ctx: Ctx, name: string, summary: Record<string, unknown>, work: () => Promise<unknown>) {
  try {
    summary[name] = await work()
  } catch (error) {
    summary[name] = 'error'
    ctx.log.error('billing.step_failed', { step: name, error })
  }
}

/** Move each row on its own, so one broken workspace never stops the rest. */
async function each<T extends { workspaceId: string }>(ctx: Ctx, rows: T[], fn: (row: T) => Promise<void>): Promise<number> {
  let done = 0
  for (const row of rows) {
    try {
      await fn(row)
      done++
    } catch (error) {
      ctx.log.error('billing.workspace_failed', { workspaceId: row.workspaceId, error })
    }
  }
  return done
}

async function downgrade(ctx: Ctx, workspaceId: string, transition: SubscriptionTransition) {
  await transitionSubscription({ workspaceId, transition, force: true })
  await enforceWorkspaceLimits(ctx, workspaceId)
}

/**
 * billing.daily, 00:05 WIB (docs/blueprint/07 §7, 15 §3). The Payment Hub never charges automatically, so
 * time moves subscriptions here: trials end, unpaid periods enter grace, grace and cancelled periods end.
 */
export const billingDailyJob: JobHandler = async (_job, base) => {
  const ctx = base as Ctx
  const now = new Date()
  const summary: Record<string, unknown> = {}
  const due = (where: ReturnType<typeof and>) => ctx.db.select({ workspaceId: subscriptions.workspaceId, sub: subscriptions, planName: plans.name, priceMonthly: plans.priceMonthly, priceYearly: plans.priceYearly })
    .from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
    .where(and(where, eq(workspaces.status, 'active'), isNull(workspaces.deletedAt)))

  await step(ctx, 'trialExpired', summary, async () => each(ctx, await due(and(eq(subscriptions.status, 'trialing'), isNotNull(subscriptions.trialEndsAt), lte(subscriptions.trialEndsAt, now))), row => downgrade(ctx, row.workspaceId, 'trial_expired')))

  await step(ctx, 'periodLapsed', summary, async () => each(ctx, await due(and(eq(subscriptions.status, 'active'), isNotNull(subscriptions.currentPeriodEnd), lte(subscriptions.currentPeriodEnd, now))), async (row) => {
    const sub = await transitionSubscription({ workspaceId: row.workspaceId, transition: 'payment_failed', force: true })
    if (!sub.graceEndsAt) return
    const amount = toRupiah(row.sub.period === 'yearly' ? row.priceYearly : row.priceMonthly)
    await notifyWorkspaceOwners(ctx, row.workspaceId, {
      templateKey: 'payment_failed',
      dedupeKey: `payment_failed:lapsed:${row.workspaceId}:${wibDay(now)}`,
      variables: { amount: formatIDR(amount), planName: row.planName, graceEndsAt: dateFormat.format(sub.graceEndsAt), billingUrl: '/app/billing' }
    })
  }))

  await step(ctx, 'graceExpired', summary, async () => each(ctx, await due(and(eq(subscriptions.status, 'past_due'), or(isNull(subscriptions.graceEndsAt), lte(subscriptions.graceEndsAt, now)))), row => downgrade(ctx, row.workspaceId, 'grace_expired')))

  await step(ctx, 'cancelledEnded', summary, async () => each(ctx, await due(and(eq(subscriptions.status, 'cancelled'), or(isNull(subscriptions.currentPeriodEnd), lte(subscriptions.currentPeriodEnd, now)))), row => downgrade(ctx, row.workspaceId, 'grace_expired')))

  await step(ctx, 'trialEndingSoon', summary, async () => {
    const days = Math.max(0, Math.trunc(await getSettingNumber('billing.trialReminderDays', 3, ctx.db)))
    if (!days) return 0
    const rows = await due(and(eq(subscriptions.status, 'trialing'), isNotNull(subscriptions.trialEndsAt), sql`${subscriptions.trialEndsAt} <= ${new Date(now.getTime() + days * 86_400_000)}`))
    return each(ctx, rows, async (row) => {
      await notifyWorkspaceOwners(ctx, row.workspaceId, {
        templateKey: 'trial_ending_soon',
        dedupeKey: `trial_ending_soon:${row.workspaceId}:${wibDay(now)}`,
        variables: { daysLeft: String(Math.max(0, daysUntil(row.sub.trialEndsAt!, now))), planName: row.planName, trialEndsAt: dateFormat.format(row.sub.trialEndsAt!), billingUrl: '/app/billing' }
      })
    })
  })

  await step(ctx, 'reconcile', summary, () => reconcilePendingPayments(ctx))
  ctx.log.info('billing.daily', summary)
}

/** billing.renewal-reminders, 07:00 WIB: active plans ending in exactly one of billing.renewalReminderDays. */
export const renewalRemindersJob: JobHandler = async (_job, base) => {
  const ctx = base as Ctx
  const now = new Date()
  const days = new Set((await getSetting('billing.renewalReminderDays', ctx.db)).split(',').map(v => Number(v.trim())).filter(n => Number.isInteger(n) && n > 0))
  if (!days.size) return
  const horizon = new Date(now.getTime() + (Math.max(...days) + 1) * 86_400_000)
  const rows = await ctx.db.select({ workspaceId: subscriptions.workspaceId, end: subscriptions.currentPeriodEnd, period: subscriptions.period, planName: plans.name, priceMonthly: plans.priceMonthly, priceYearly: plans.priceYearly })
    .from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(inArray(subscriptions.status, ['active']), isNotNull(subscriptions.currentPeriodEnd), sql`${subscriptions.currentPeriodEnd} > ${now}`, lte(subscriptions.currentPeriodEnd, horizon)))
  const sent = await each(ctx, rows.filter(row => days.has(daysUntil(row.end!, now))), async (row) => {
    await notifyWorkspaceOwners(ctx, row.workspaceId, {
      templateKey: 'renewal_reminder',
      dedupeKey: `renewal_reminder:${row.workspaceId}:${wibDay(now)}`,
      variables: {
        daysLeft: String(daysUntil(row.end!, now)), planName: row.planName, periodEnd: dateFormat.format(row.end!),
        amount: formatIDR(toRupiah(row.period === 'yearly' ? row.priceYearly : row.priceMonthly)), billingUrl: '/app/billing'
      }
    })
  })
  ctx.log.info('billing.renewal_reminders', { candidates: rows.length, sent })
}
