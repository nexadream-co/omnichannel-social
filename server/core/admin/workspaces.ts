import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import { auditLogs, bioPages, dmRules, jobs, links, payments, plans, posts, postTargets, socialAccounts, subscriptionEvents, subscriptions, users, workspaceMembers, workspaces } from '../db/schema'
import { entitlementUsage, getEntitlements, invalidateEntitlements } from '../entitlements'
import { appError } from '../errors'
import { enqueue } from '../jobs/enqueue'
import { notifyWorkspaceOwners } from '../notifications'
import { createImpersonationSession } from '../services/auth'
import { enforceWorkspaceLimits, transitionSubscription } from '../subscriptions'

const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })

export const workspaceListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  planSlug: z.string().default('all'),
  subscriptionStatus: z.enum(['all', 'trialing', 'active', 'past_due', 'cancelled', 'downgraded', 'suspended']).default('all'),
  deleteRequested: z.enum(['all', 'true']).default('all')
})

const ownerUser = sql<string | null>`(select u.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${workspaces.id} and m.role = 'owner' order by m.created_at limit 1)`

/** docs/blueprint/09 §3.2. Soft-deleted workspaces are excluded. Search by name, owner email or phone. */
export async function listWorkspaces(ctx: StaffContext, query: z.infer<typeof workspaceListQuery>) {
  assertPermission(ctx, 'workspaces.read')
  const like = `%${query.search}%`
  const where = and(
    isNull(workspaces.deletedAt),
    query.status !== 'all' ? eq(workspaces.status, query.status) : undefined,
    query.planSlug !== 'all' ? eq(plans.slug, query.planSlug) : undefined,
    query.subscriptionStatus !== 'all' ? eq(subscriptions.status, query.subscriptionStatus) : undefined,
    query.deleteRequested === 'true' ? isNotNull(workspaces.deleteRequestedAt) : undefined,
    query.search
      ? or(ilike(workspaces.name, like), sql`exists (select 1 from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${workspaces.id} and (u.email ilike ${like} or u.phone ilike ${like}))`)
      : undefined
  )
  const from = () => ctx.db.select({
    id: workspaces.id, name: workspaces.name, status: workspaces.status, createdAt: workspaces.createdAt, deleteRequestedAt: workspaces.deleteRequestedAt,
    planSlug: plans.slug, planName: plans.name, subscriptionStatus: subscriptions.status, trialEndsAt: subscriptions.trialEndsAt, currentPeriodEnd: subscriptions.currentPeriodEnd,
    ownerEmail: sql<string | null>`(select u.email from users u where u.id = ${ownerUser})`,
    accounts: sql<number>`(select count(*)::int from social_accounts s where s.workspace_id = ${workspaces.id} and s.status <> 'revoked')`
  }).from(workspaces).innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id)).innerJoin(plans, eq(plans.id, subscriptions.planId))
  const [items, [total], planRows] = await Promise.all([
    from().where(where).orderBy(desc(workspaces.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(workspaces).innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id)).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(where),
    ctx.db.select({ slug: plans.slug, name: plans.name }).from(plans).orderBy(asc(plans.order))
  ])
  return { items, plans: planRows, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

async function loadWorkspace(ctx: StaffContext, id: string) {
  const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
  if (!ws || ws.deletedAt) throw appError(404, 'Ruang kerja tidak ditemukan.', 'NOT_FOUND')
  return ws
}

/** Detail + read-only support drill-down. Never a creator's post content or DM text. */
export async function getWorkspaceDetail(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'workspaces.read')
  const ws = await loadWorkspace(ctx, id)
  const [[sub], members, recentPayments, accounts, targets, [linkCount], bio, [ruleCount], entitlements, usage, deleteRequest, planRows] = await Promise.all([
    ctx.db.select({ sub: subscriptions, plan: plans }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.workspaceId, id)),
    ctx.db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: workspaceMembers.role, isActive: workspaceMembers.isActive, lastLoginAt: users.lastLoginAt, lastSeenAt: users.lastSeenAt })
      .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, id)).orderBy(asc(workspaceMembers.createdAt)),
    ctx.db.select({ id: payments.id, orderId: payments.orderId, amount: payments.amount, status: payments.status, planSlug: payments.planSlug, period: payments.period, createdAt: payments.createdAt, paidAt: payments.paidAt })
      .from(payments).where(eq(payments.workspaceId, id)).orderBy(desc(payments.createdAt)).limit(10),
    ctx.db.select({ id: socialAccounts.id, platform: socialAccounts.platform, username: socialAccounts.username, status: socialAccounts.status, tokenExpiresAt: socialAccounts.tokenExpiresAt, createdAt: socialAccounts.createdAt })
      .from(socialAccounts).where(and(eq(socialAccounts.workspaceId, id), sql`${socialAccounts.status} <> 'revoked'`)).orderBy(asc(socialAccounts.createdAt)),
    ctx.db.select({ id: postTargets.id, platform: postTargets.platform, format: postTargets.format, status: postTargets.status, scheduledAt: postTargets.scheduledAt, lastErrorCode: postTargets.lastErrorCode, updatedAt: postTargets.updatedAt })
      .from(postTargets).where(eq(postTargets.workspaceId, id)).orderBy(desc(postTargets.updatedAt)).limit(20),
    ctx.db.select({ n: count() }).from(links).where(eq(links.workspaceId, id)),
    ctx.db.select({ id: bioPages.id, handle: bioPages.handle, published: bioPages.published }).from(bioPages).where(eq(bioPages.workspaceId, id)),
    ctx.db.select({ n: count() }).from(dmRules).where(eq(dmRules.workspaceId, id)),
    getEntitlements(id, undefined, ctx.db),
    entitlementUsage(ctx.db, id, ws.timezone),
    ctx.db.select({ actorName: auditLogs.actorName, createdAt: auditLogs.createdAt, metadata: auditLogs.metadata }).from(auditLogs)
      .where(and(eq(auditLogs.workspaceId, id), eq(auditLogs.action, 'workspace.delete_request'))).orderBy(desc(auditLogs.createdAt)).limit(1),
    ctx.db.select({ slug: plans.slug, name: plans.name }).from(plans).orderBy(asc(plans.order))
  ])
  return {
    workspace: { id: ws.id, name: ws.name, slug: ws.slug, timezone: ws.timezone, status: ws.status, suspendedAt: ws.suspendedAt, suspendedReason: ws.suspendedReason, createdAt: ws.createdAt, onboardingCompletedAt: ws.onboardingCompletedAt, niche: ws.niche, deleteRequestedAt: ws.deleteRequestedAt },
    subscription: sub ? { status: sub.sub.status, period: sub.sub.period, trialEndsAt: sub.sub.trialEndsAt, currentPeriodEnd: sub.sub.currentPeriodEnd, graceEndsAt: sub.sub.graceEndsAt, cancelledAt: sub.sub.cancelledAt, planSlug: sub.plan.slug, planName: sub.plan.name } : null,
    entitlements: { effectivePlanSlug: entitlements.effectivePlanSlug, limits: entitlements.limits, features: entitlements.features, usage },
    members, payments: recentPayments, deleteRequest: deleteRequest[0] ?? null, plans: planRows,
    drillDown: { accounts, targets, linkCount: linkCount?.n ?? 0, bio, ruleCount: ruleCount?.n ?? 0 }
  }
}

export const suspendSchema = z.object({ reason: z.string().trim().min(3, 'Tulis alasan penangguhan.').max(500) })

/** docs/blueprint/05 §7. Publishing and auto-reply stop (their jobs check the status); links keep resolving. */
export async function suspendWorkspace(ctx: StaffContext, id: string, reason: string) {
  assertPermission(ctx, 'workspaces.write')
  const ws = await loadWorkspace(ctx, id)
  if (ws.status === 'suspended') throw appError(409, 'Ruang kerja ini sudah ditangguhkan.', 'CONFLICT')
  await ctx.db.transaction(async (tx) => {
    await tx.update(workspaces).set({ status: 'suspended', suspendedAt: new Date(), suspendedReason: reason, updatedAt: new Date() }).where(eq(workspaces.id, id))
    await transitionSubscription({ workspaceId: id, transition: 'suspend', force: true, tx })
  })
  await notifyWorkspaceOwners(ctx, id, { templateKey: 'workspace_suspended', dedupeKey: `workspace_suspended:${id}:${Date.now()}`, variables: { workspaceName: ws.name, reason } })
  await recordAudit(ctx, { audience: 'staff', action: 'workspace.suspend', actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, workspaceId: id, targetType: 'workspace', targetId: id, metadata: { reason } })
}

/**
 * Reinstate: posts whose time passed during the suspension fail with a reason (never published late without
 * the creator's consent); future ones get their publish job back.
 */
export async function reinstateWorkspace(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'workspaces.write')
  const ws = await loadWorkspace(ctx, id)
  if (ws.status !== 'suspended') throw appError(409, 'Ruang kerja ini tidak sedang ditangguhkan.', 'CONFLICT')
  const now = new Date()
  const result = await ctx.db.transaction(async (tx) => {
    await tx.update(workspaces).set({ status: 'active', suspendedAt: null, suspendedReason: null, updatedAt: now }).where(eq(workspaces.id, id))
    await transitionSubscription({ workspaceId: id, transition: 'reinstate', force: true, tx })
    const missed = await tx.update(postTargets).set({ status: 'failed', lastErrorCode: 'missed_while_suspended', lastErrorMsg: 'Terlewat saat akun ditangguhkan', updatedAt: now })
      .where(and(eq(postTargets.workspaceId, id), eq(postTargets.status, 'scheduled'), lte(postTargets.scheduledAt, now))).returning({ id: postTargets.id })
    const future = await tx.select({ id: postTargets.id, scheduledAt: postTargets.scheduledAt, version: posts.version }).from(postTargets).innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(and(eq(postTargets.workspaceId, id), eq(postTargets.status, 'scheduled')))
    for (const target of future) {
      const jobId = await enqueue(tx, 'publish.target', { targetId: target.id, workspaceId: id, version: target.version }, { runAt: target.scheduledAt ?? now, singletonKey: `${target.id}:v${target.version}:reinstate:${now.getTime()}` })
      await tx.update(postTargets).set({ jobId }).where(eq(postTargets.id, target.id))
    }
    return { missed: missed.length, rescheduled: future.length }
  })
  await recordAudit(ctx, { audience: 'staff', action: 'workspace.reinstate', actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, workspaceId: id, targetType: 'workspace', targetId: id, metadata: result })
  return result
}

export const planOverrideSchema = z.object({
  planSlug: z.string().min(1),
  period: z.enum(['monthly', 'yearly']),
  status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'downgraded']),
  currentPeriodEnd: z.iso.datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(500).optional()
})

/** The audited override: bypasses the transition guard on purpose (comped / negotiated plans). */
export async function overridePlan(ctx: StaffContext, id: string, input: z.infer<typeof planOverrideSchema>) {
  assertPermission(ctx, 'subscriptions.write')
  await loadWorkspace(ctx, id)
  const [plan] = await ctx.db.select().from(plans).where(eq(plans.slug, input.planSlug)).limit(1)
  if (!plan) throw appError(404, 'Paket tidak ditemukan.', 'NOT_FOUND')
  const before = await ctx.db.transaction(async (tx) => {
    const [current] = await tx.select({ sub: subscriptions, planSlug: plans.slug }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.workspaceId, id)).for('update').limit(1)
    if (!current) throw appError(404, 'Langganan tidak ditemukan.', 'NOT_FOUND')
    const end = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null
    await tx.update(subscriptions).set({
      planId: plan.id, period: input.period, status: input.status,
      currentPeriodEnd: input.status === 'trialing' ? null : end ?? current.sub.currentPeriodEnd,
      trialEndsAt: input.status === 'trialing' ? end ?? new Date(Date.now() + plan.trialDays * 86_400_000) : null,
      graceEndsAt: input.status === 'past_due' ? current.sub.graceEndsAt ?? new Date(Date.now() + 3 * 86_400_000) : null,
      cancelledAt: input.status === 'cancelled' ? current.sub.cancelledAt ?? new Date() : null,
      downgradedAt: input.status === 'downgraded' ? new Date() : null,
      updatedAt: new Date()
    }).where(eq(subscriptions.id, current.sub.id))
    await tx.insert(subscriptionEvents).values({ workspaceId: id, transition: 'admin_override', fromStatus: current.sub.status, toStatus: input.status, fromPlanSlug: current.planSlug, toPlanSlug: plan.slug, period: input.period })
    return { status: current.sub.status, planSlug: current.planSlug }
  })
  await invalidateEntitlements(id, ctx.db)
  await enforceWorkspaceLimits(ctx, id)
  await recordAudit(ctx, { audience: 'staff', action: 'subscription.plan_change', actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, workspaceId: id, targetType: 'subscription', targetId: id, metadata: { before, after: input } })
}

/** Superadmin only. Soft delete; tokens dropped, jobs cancelled, owner told (their last message). */
export async function deleteWorkspace(ctx: StaffContext, id: string) {
  if (!ctx.isSuperAdmin) throw appError(403, 'Hanya superadmin yang bisa menghapus ruang kerja.', 'FORBIDDEN')
  const ws = await loadWorkspace(ctx, id)
  await notifyWorkspaceOwners(ctx, id, { templateKey: 'workspace_deleted', dedupeKey: `workspace_deleted:${id}`, variables: { workspaceName: ws.name, appName: 'Socialz.id' } })
  await ctx.db.transaction(async (tx) => {
    await tx.update(workspaces).set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() }).where(eq(workspaces.id, id))
    await tx.update(socialAccounts).set({ status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null, updatedAt: new Date() }).where(eq(socialAccounts.workspaceId, id))
    await tx.update(jobs).set({ status: 'cancelled', finishedAt: new Date() }).where(and(eq(jobs.workspaceId, id), inArray(jobs.status, ['queued'])))
    await tx.update(bioPages).set({ published: false }).where(eq(bioPages.workspaceId, id))
  })
  await recordAudit(ctx, { audience: 'staff', action: 'workspace.delete', actorId: ctx.staffUserId, actorName: ctx.staffName, workspaceId: id, targetType: 'workspace', targetId: id, metadata: { name: ws.name } })
}

/** Superadmin, not already impersonating. Opens /app as a member (the owner by default). */
export async function impersonateCreator(ctx: StaffContext, input: { workspaceId?: string, userId?: string }) {
  if (!ctx.isSuperAdmin) throw appError(403, 'Hanya superadmin yang bisa menyamar sebagai pengguna.', 'FORBIDDEN')
  if (ctx.impersonatorId) throw appError(403, 'Berhenti menyamar dulu sebelum menyamar lagi.', 'FORBIDDEN')
  const [member] = await ctx.db.select({ userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId, isActive: users.isActive })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(
      eq(workspaceMembers.isActive, true), isNull(workspaces.deletedAt),
      input.workspaceId ? eq(workspaceMembers.workspaceId, input.workspaceId) : undefined,
      input.userId ? eq(workspaceMembers.userId, input.userId) : eq(workspaceMembers.role, 'owner')
    )).orderBy(asc(workspaceMembers.createdAt)).limit(1)
  if (!member) throw appError(404, 'Pengguna tidak ditemukan.', 'NOT_FOUND')
  if (!member.isActive) throw appError(409, 'Pengguna ini nonaktif.', 'CONFLICT')
  const session = await createImpersonationSession(member.userId, member.workspaceId, ctx.staffUserId)
  await recordAudit(ctx, { audience: 'staff', action: 'workspace.impersonate_start', actorId: ctx.staffUserId, actorName: ctx.staffName, workspaceId: member.workspaceId, targetType: 'user', targetId: member.userId, metadata: { sessionId: session.sessionId } })
  return session
}
