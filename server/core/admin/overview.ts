import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import type { Database } from '../db/client'
import { contactMessages, jobSchedules, jobs, payments, plans, subscriptions, systemHeartbeat, webhookEvents, workspaces } from '../db/schema'
import { appError } from '../errors'
import { checkHealth } from '../jobs/health'
import { kick } from '../jobs/runner'
import { dmSentToday } from './operations'

const TZ = 'Asia/Jakarta'

/**
 * /admin/dashboard (09 §3.1). Aggregates only: never a creator's post content.
 */
export async function adminDashboard(ctx: StaffContext) {
  assertPermission(ctx, 'dashboard.read')
  const db = ctx.db as Database
  const monthStart = sql`(date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ})`
  const [[ws], subsByStatus, [revenue], [unread], newest, latestPayments, signups, publishing, [reauth], dms, [backlog], health, queues, [dead]] = await Promise.all([
    db.select({
      total: sql<number>`count(*) filter (where ${workspaces.deletedAt} is null)::int`,
      active: sql<number>`count(*) filter (where ${workspaces.status} = 'active' and ${workspaces.deletedAt} is null)::int`,
      suspended: sql<number>`count(*) filter (where ${workspaces.status} = 'suspended')::int`,
      newThisMonth: sql<number>`count(*) filter (where ${workspaces.createdAt} >= ${monthStart})::int`
    }).from(workspaces),
    db.select({ status: subscriptions.status, n: count() }).from(subscriptions).innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId)).where(isNull(workspaces.deletedAt)).groupBy(subscriptions.status),
    db.select({ amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int`, n: count() }).from(payments).where(and(eq(payments.status, 'paid'), sql`${payments.paidAt} >= ${monthStart}`)),
    db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'new')),
    db.select({ id: workspaces.id, name: workspaces.name, status: workspaces.status, createdAt: workspaces.createdAt, planName: plans.name, subscriptionStatus: subscriptions.status })
      .from(workspaces).innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id)).innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(isNull(workspaces.deletedAt)).orderBy(desc(workspaces.createdAt)).limit(6),
    db.select({ id: payments.id, orderId: payments.orderId, amount: payments.amount, status: payments.status, createdAt: payments.createdAt, workspaceName: workspaces.name })
      .from(payments).innerJoin(workspaces, eq(workspaces.id, payments.workspaceId)).where(gte(payments.createdAt, new Date(Date.now() - 30 * 86_400_000))).orderBy(desc(payments.createdAt)).limit(6),
    db.execute<{ month: string, n: number }>(sql`select to_char(date_trunc('month', created_at at time zone ${TZ}), 'YYYY-MM') as month, count(*)::int as n from users
      where created_at >= (date_trunc('month', now() at time zone ${TZ}) - interval '5 months') at time zone ${TZ} group by 1 order by 1`).then(r => r.rows),
    db.execute<{ platform: string, published: number, failed: number }>(sql`select platform::text, count(*) filter (where status = 'published')::int as published,
      count(*) filter (where status in ('failed', 'publish_unknown'))::int as failed from post_targets where updated_at > now() - interval '24 hours' group by 1 order by 1`).then(r => r.rows),
    db.execute<{ n: number }>(sql`select count(*)::int as n from social_accounts where status = 'needs_reauth'`).then(r => r.rows),
    dmSentToday(db),
    db.select({ n: count() }).from(webhookEvents).where(and(eq(webhookEvents.provider, 'meta'), isNull(webhookEvents.processedAt))),
    checkHealth(db),
    db.select({ queue: jobs.queue, n: count() }).from(jobs).where(and(eq(jobs.status, 'queued'), sql`${jobs.runAt} <= now()`)).groupBy(jobs.queue),
    db.select({ n: count() }).from(jobs).where(eq(jobs.status, 'dead'))
  ])
  return {
    workspaces: ws, subscriptionsByStatus: subsByStatus, revenueThisMonth: revenue, unreadMessages: unread?.n ?? 0,
    newestWorkspaces: newest, latestPayments, signupsByMonth: signups,
    health: { ...health, publishing, needsReauth: reauth?.n ?? 0, dmsToday: dms, metaBacklog: backlog?.n ?? 0, queues, deadJobs: dead?.n ?? 0 }
  }
}

export const reportsQuery = z.object({ period: z.enum(['day', 'week', 'month']).default('month'), limit: z.coerce.number().int().min(1).max(60).default(6) })

/** /admin/reports (09 §3.1): one clock (Asia/Jakarta), aggregate only. */
export async function adminReports(ctx: StaffContext, query: z.infer<typeof reportsQuery>) {
  assertPermission(ctx, 'reports.read')
  const db = ctx.db as Database
  const unit = sql.raw(`'${query.period}'`)
  const step = sql.raw(`'1 ${query.period}'`)
  const span = sql.raw(`'${query.limit - 1} ${query.period}'`)
  const bucket = (col: string) => sql.raw(`to_char(date_trunc('${query.period}', ${col} at time zone '${TZ}'), 'YYYY-MM-DD')`)
  const from = sql`(date_trunc(${unit}, now() at time zone ${TZ}) - interval ${span}) at time zone ${TZ}`
  const series = await db.execute<Record<string, number | string>>(sql`
    with buckets as (
      select to_char(g, 'YYYY-MM-DD') as bucket from generate_series(date_trunc(${unit}, now() at time zone ${TZ}) - interval ${span}, date_trunc(${unit}, now() at time zone ${TZ}), interval ${step}) g
    ),
    pay as (select ${bucket('paid_at')} as bucket, sum(amount)::int as revenue, count(*)::int as payments from payments where status = 'paid' and paid_at >= ${from} group by 1),
    ev as (select ${bucket('created_at')} as bucket,
      count(*) filter (where transition = 'pay' and (from_status is null or from_status in ('trialing', 'downgraded')))::int as new_paid,
      count(*) filter (where transition = 'pay' and from_status in ('active', 'past_due', 'cancelled'))::int as renewals,
      count(*) filter (where to_status = 'downgraded' and from_status in ('active', 'past_due', 'cancelled'))::int as churned,
      count(*) filter (where transition = 'trial_expired')::int as trials_lapsed
      from subscription_events where created_at >= ${from} group by 1),
    su as (select ${bucket('created_at')} as bucket, count(*)::int as signups, count(*) filter (where onboarding_completed_at is not null)::int as onboarded from workspaces where created_at >= ${from} group by 1),
    pub as (select ${bucket('published_at')} as bucket, count(*)::int as posts from post_targets where status = 'published' and published_at >= ${from} group by 1),
    dm as (select ${bucket('updated_at')} as bucket, count(*)::int as dms from dm_events where status = 'dm_sent' and updated_at >= ${from} group by 1),
    cl as (select ${bucket('clicked_at')} as bucket, count(*)::int as clicks from link_clicks where not is_bot and clicked_at >= ${from} group by 1)
    select b.bucket, coalesce(pay.revenue, 0) as revenue, coalesce(pay.payments, 0) as payments, coalesce(ev.new_paid, 0) as "newPaid", coalesce(ev.renewals, 0) as renewals,
      coalesce(ev.churned, 0) as churned, coalesce(ev.trials_lapsed, 0) as "trialsLapsed", coalesce(su.signups, 0) as signups, coalesce(su.onboarded, 0) as onboarded,
      coalesce(pub.posts, 0) as posts, coalesce(dm.dms, 0) as dms, coalesce(cl.clicks, 0) as clicks
    from buckets b left join pay using (bucket) left join ev using (bucket) left join su using (bucket) left join pub using (bucket) left join dm using (bucket) left join cl using (bucket)
    order by b.bucket`).then(r => r.rows)

  const [byPlan, book, [since], usage] = await Promise.all([
    db.execute<{ plan: string, period: string, revenue: number, payments: number }>(sql`select coalesce(plan_slug, '-') as plan, period::text, sum(amount)::int as revenue, count(*)::int as payments
      from payments where status = 'paid' and paid_at >= ${from} group by 1, 2 order by 3 desc`).then(r => r.rows),
    db.execute<{ plan: string, status: string, n: number, mrr: number }>(sql`select p.slug as plan, s.status::text, count(*)::int as n,
      sum(case when s.status in ('active', 'cancelled', 'past_due') then (case when s.period = 'yearly' then p.price_yearly / 12 else p.price_monthly end) else 0 end)::int as mrr
      from subscriptions s join plans p on p.id = s.plan_id join workspaces w on w.id = s.workspace_id where w.deleted_at is null group by 1, 2 order by 1, 2`).then(r => r.rows),
    db.execute<{ since: string | null }>(sql`select min(created_at)::text as since from subscription_events`).then(r => r.rows),
    db.execute<{ device: string, count: number }>(sql`select device::text, sum(count)::int as count from usage_daily where date_key >= to_char(${from} at time zone ${TZ}, 'YYYY-MM-DD') group by 1`).then(r => r.rows)
  ])
  const totals = series.reduce<Record<string, number>>((acc, row) => {
    for (const [k, v] of Object.entries(row)) if (k !== 'bucket') acc[k] = (acc[k] ?? 0) + Number(v)
    return acc
  }, {})
  const paying = book.filter(b => ['active', 'cancelled', 'past_due'].includes(b.status))
  return {
    period: query.period, series, totals,
    averagePayment: totals.payments ? Math.round((totals.revenue ?? 0) / totals.payments) : 0,
    conversion: totals.signups ? Math.round(((totals.newPaid ?? 0) / totals.signups) * 1000) / 10 : 0,
    revenueByPlan: byPlan,
    book: { mrr: paying.reduce((s, b) => s + Number(b.mrr), 0), paying: paying.reduce((s, b) => s + b.n, 0), trialing: book.filter(b => b.status === 'trialing').reduce((s, b) => s + b.n, 0), pastDue: book.filter(b => b.status === 'past_due').reduce((s, b) => s + b.n, 0), rows: book },
    historySince: since?.since ?? null,
    usage
  }
}

/** /admin/system/jobs (09 §3.6). */
export async function jobsOverview(ctx: StaffContext) {
  assertPermission(ctx, 'settings.read')
  const db = ctx.db as Database
  const [queues, deadJobs, schedules, beats] = await Promise.all([
    db.execute<{ queue: string, queued: number, due: number, running: number, dead: number, oldest_due_seconds: number | null }>(sql`select queue,
      count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'queued' and run_at <= now())::int as due,
      count(*) filter (where status = 'running')::int as running, count(*) filter (where status = 'dead')::int as dead,
      extract(epoch from now() - min(run_at) filter (where status = 'queued' and run_at <= now()))::int as oldest_due_seconds
      from jobs group by queue order by queue`).then(r => r.rows),
    db.select({ id: jobs.id, queue: jobs.queue, attempts: jobs.attempts, lastError: jobs.lastError, finishedAt: jobs.finishedAt, workspaceId: jobs.workspaceId }).from(jobs).where(eq(jobs.status, 'dead')).orderBy(desc(jobs.finishedAt)).limit(50),
    db.select().from(jobSchedules).orderBy(jobSchedules.name),
    db.select().from(systemHeartbeat)
  ])
  return { queues, deadJobs, schedules, heartbeats: beats }
}

/** "Coba lagi" on a dead job: back to queued with a fresh attempt budget. */
export async function retryDeadJob(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'settings.write')
  const rows = await ctx.db.update(jobs).set({ status: 'queued', runAt: new Date(), attempts: 0, lastError: null, finishedAt: null, leaseUntil: null })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'dead'))).returning({ id: jobs.id, queue: jobs.queue })
  if (!rows.length) throw appError(404, 'Pekerjaan gagal tidak ditemukan.', 'NOT_FOUND')
  await recordAudit(ctx, { audience: 'staff', action: 'system.job_retry', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'job', targetId: id, metadata: { queue: rows[0]!.queue } })
  ctx.defer(kick({ ...ctx, db: ctx.db as Database }, [id]))
}
