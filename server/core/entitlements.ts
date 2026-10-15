import { and, count, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import { LIMIT_META, normalizeFeatures, normalizeLimits, type FeatureKey, type LimitKey, type PlanFeatures, type PlanLimits } from '../../shared/utils/plans'
import type { WorkspaceContext } from './context'
import type { Executor } from './db/client'
import { getDb } from './db/client'
import { bioPages, dmEvents, dmRules, mediaAssets, plans, postTargets, socialAccounts, subscriptions, workspaceInvitations, workspaceMembers, workspaces } from './db/schema'
import { appError } from './errors'
import { getSetting } from './settings'

export interface Entitlements {
  workspaceId: string
  version: number
  planSlug: string // the plan on the subscription row
  planName: string // name of the plan actually in force
  effectivePlanSlug: string // honouring trial and grace
  status: string
  limits: PlanLimits
  features: PlanFeatures
  trialEndsAt: Date | null
  trialDaysRemaining: number | null
  graceEndsAt: Date | null
  currentPeriodEnd: Date | null
  isTrialing: boolean
  isInGrace: boolean
}

type SubscriptionRow = typeof subscriptions.$inferSelect

/** Does the subscription grant its plan right now? (docs/blueprint/06 §3) */
export function subscriptionGrantsPlan(s: Pick<SubscriptionRow, 'status' | 'trialEndsAt' | 'currentPeriodEnd' | 'graceEndsAt'>, now: Date = new Date()): boolean {
  switch (s.status) {
    case 'trialing': return !s.trialEndsAt || s.trialEndsAt > now
    case 'active': return true
    case 'cancelled': return Boolean(s.currentPeriodEnd && s.currentPeriodEnd > now)
    case 'past_due': return Boolean(s.graceEndsAt && s.graceEndsAt > now)
    default: return false // downgraded, suspended
  }
}

const TTL_MS = 60_000
const cacheKey = Symbol.for('socialz.entitlements')
type Cache = Map<string, { at: number, version: number, value: Entitlements }>
type GlobalWithEntitlements = typeof globalThis & { [cacheKey]?: Cache }

function cache(): Cache {
  const g = globalThis as GlobalWithEntitlements
  g[cacheKey] ??= new Map()
  return g[cacheKey]!
}

/**
 * The only place plan limits/features are read (docs/blueprint/06 §3). Cache key includes
 * workspaces.entitlements_version, so a change made on any instance is seen on the next request.
 * The effective plan falls back to the default (Gratis) plan when the subscription no longer grants its own.
 */
export async function getEntitlements(workspaceId: string, knownVersion?: number, db: Executor = getDb()): Promise<Entitlements> {
  const hit = cache().get(workspaceId)
  if (hit && knownVersion !== undefined && hit.version === knownVersion && Date.now() - hit.at < TTL_MS) return hit.value
  const [row] = await db.select({ version: workspaces.entitlementsVersion, subscription: subscriptions, plan: plans })
    .from(workspaces)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  if (!row) throw appError(404, 'Ruang kerja tidak ditemukan.', 'NOT_FOUND')
  const now = new Date()
  const grants = subscriptionGrantsPlan(row.subscription, now)
  let effective = row.plan
  if (!grants) {
    const [fallback] = await db.select().from(plans).where(eq(plans.slug, await getSetting('billing.defaultPlanSlug', db))).limit(1)
    if (fallback) effective = fallback
  }
  const s = row.subscription
  const isTrialing = s.status === 'trialing' && grants
  const value: Entitlements = {
    workspaceId,
    version: row.version,
    planSlug: row.plan.slug,
    planName: effective.name,
    effectivePlanSlug: effective.slug,
    status: s.status,
    limits: normalizeLimits(effective.limits),
    features: normalizeFeatures(effective.features),
    trialEndsAt: s.trialEndsAt,
    trialDaysRemaining: isTrialing && s.trialEndsAt ? Math.max(0, Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / 86_400_000)) : null,
    graceEndsAt: s.graceEndsAt,
    currentPeriodEnd: s.currentPeriodEnd,
    isTrialing,
    isInGrace: s.status === 'past_due' && grants
  }
  cache().set(workspaceId, { at: Date.now(), version: row.version, value })
  return value
}

/** Clears the local copy and bumps the version every other instance compares against. No id = every workspace. */
export async function invalidateEntitlements(workspaceId?: string, db: Executor = getDb()): Promise<void> {
  if (!workspaceId) {
    cache().clear()
    await db.update(workspaces).set({ entitlementsVersion: sql`${workspaces.entitlementsVersion} + 1` })
    return
  }
  cache().delete(workspaceId)
  await db.update(workspaces).set({ entitlementsVersion: sql`${workspaces.entitlementsVersion} + 1` }).where(eq(workspaces.id, workspaceId))
}

export async function can(workspaceId: string, feature: FeatureKey, db?: Executor): Promise<boolean> {
  return (await getEntitlements(workspaceId, undefined, db)).features[feature]
}

export async function limit(workspaceId: string, key: LimitKey, db?: Executor): Promise<number> {
  return (await getEntitlements(workspaceId, undefined, db)).limits[key]
}

/** 402 PLAN_REQUIRED. Call after the role check (role = 403 first). */
export async function requireEntitlement(ctx: Pick<WorkspaceContext, 'workspaceId' | 'db'>, feature: FeatureKey): Promise<void> {
  if (!(await can(ctx.workspaceId, feature, ctx.db))) {
    throw appError(402, 'Fitur ini belum tersedia di paket kamu. Upgrade untuk membukanya.', 'PLAN_REQUIRED', { feature })
  }
}

/**
 * 402 LIMIT_REACHED when `current` already uses the whole allowance (adding one more would exceed it).
 * -1 means unlimited. Call after the role check (docs/blueprint/06 §4).
 */
export async function assertWithinLimit(ctx: Pick<WorkspaceContext, 'workspaceId' | 'db'>, key: LimitKey, current: number): Promise<void> {
  const { limits, planName } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  const max = limits[key]
  if (max === -1 || current < max) return
  const amount = new Intl.NumberFormat('id-ID').format(max)
  throw appError(402, `Paket ${planName} hanya mengizinkan ${amount} ${LIMIT_META[key].sentence}. Upgrade untuk menambah lagi.`, 'LIMIT_REACHED', { limit: key, max, current })
}

/** Current calendar month [start, end) on the workspace clock, computed in SQL (docs/blueprint/16 §9). */
function monthBounds(tz: string) {
  const start = sql`(date_trunc('month', now() at time zone ${tz}) at time zone ${tz})`
  return { start, end: sql`(${start} + interval '1 month')` }
}

/** Real rows, never a drifting counter (docs/blueprint/06 §3.1). */
export async function countScheduledThisMonth(db: Executor, workspaceId: string, tz: string): Promise<number> {
  const { start, end } = monthBounds(tz)
  const [row] = await db.select({ n: count() }).from(postTargets).where(and(
    eq(postTargets.workspaceId, workspaceId),
    sql`${postTargets.scheduledAt} >= ${start} and ${postTargets.scheduledAt} < ${end}`,
    sql`${postTargets.status} not in ('draft', 'cancelled')`
  ))
  return row?.n ?? 0
}

export async function entitlementUsage(db: Executor, workspaceId: string, tz: string): Promise<Record<Exclude<LimitKey, 'clickRetentionDays' | 'activityLogRetentionDays'>, number>> {
  const { start, end } = monthBounds(tz)
  const [[accounts], scheduled, [bios], [rules], [dms], [members], [invites], [storage]] = await Promise.all([
    db.select({ n: count() }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.status, 'active'))),
    countScheduledThisMonth(db, workspaceId, tz),
    db.select({ n: count() }).from(bioPages).where(and(eq(bioPages.workspaceId, workspaceId), eq(bioPages.published, true))),
    db.select({ n: count() }).from(dmRules).where(and(eq(dmRules.workspaceId, workspaceId), eq(dmRules.active, true))),
    db.select({ n: count() }).from(dmEvents).where(and(eq(dmEvents.workspaceId, workspaceId), eq(dmEvents.status, 'dm_sent'), sql`${dmEvents.createdAt} >= ${start} and ${dmEvents.createdAt} < ${end}`)),
    db.select({ n: count() }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.isActive, true))),
    db.select({ n: count() }).from(workspaceInvitations).where(and(eq(workspaceInvitations.workspaceId, workspaceId), isNull(workspaceInvitations.acceptedAt), isNull(workspaceInvitations.revokedAt), gt(workspaceInvitations.expiresAt, new Date()))),
    db.select({ bytes: sql<string>`coalesce(sum(${mediaAssets.bytes}), 0)` }).from(mediaAssets).where(and(eq(mediaAssets.workspaceId, workspaceId), ne(mediaAssets.status, 'failed')))
  ])
  return {
    socialAccounts: accounts?.n ?? 0,
    scheduledPostsPerMonth: scheduled,
    bioPages: bios?.n ?? 0,
    autoReplyRules: rules?.n ?? 0,
    autoReplyDmsPerMonth: dms?.n ?? 0,
    teamMembers: (members?.n ?? 0) + (invites?.n ?? 0),
    mediaStorageMb: Math.round(Number(storage?.bytes ?? 0) / (1024 * 1024))
  }
}
