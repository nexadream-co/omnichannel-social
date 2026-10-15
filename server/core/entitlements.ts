import { eq, sql } from 'drizzle-orm'
import { normalizeFeatures, normalizeLimits, type FeatureKey, type PlanFeatures, type PlanLimits } from '../../shared/utils/plans'
import type { Executor } from './db/client'
import { getDb } from './db/client'
import { plans, subscriptions, workspaces } from './db/schema'
import { appError } from './errors'
import type { WorkspaceContext } from './context'

export interface Entitlements {
  workspaceId: string
  version: number
  planSlug: string
  planName: string
  status: string
  limits: PlanLimits
  features: PlanFeatures
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
 * The only place plan limits/features are read (docs/blueprint/06 §3).
 * Cache key includes workspaces.entitlements_version, so a change made on any instance is seen on the next request.
 */
export async function getEntitlements(workspaceId: string, knownVersion?: number, db: Executor = getDb()): Promise<Entitlements> {
  const hit = cache().get(workspaceId)
  if (hit && knownVersion !== undefined && hit.version === knownVersion && Date.now() - hit.at < TTL_MS) return hit.value
  const [row] = await db.select({
    version: workspaces.entitlementsVersion,
    planSlug: plans.slug,
    planName: plans.name,
    status: subscriptions.status,
    limits: plans.limits,
    features: plans.features
  })
    .from(workspaces)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  if (!row) throw appError(404, 'Ruang kerja tidak ditemukan.', 'NOT_FOUND')
  const value: Entitlements = {
    workspaceId,
    version: row.version,
    planSlug: row.planSlug,
    planName: row.planName,
    status: row.status,
    limits: normalizeLimits(row.limits),
    features: normalizeFeatures(row.features)
  }
  cache().set(workspaceId, { at: Date.now(), version: row.version, value })
  return value
}

/** Clears the local copy and bumps the version every other instance compares against. */
export async function invalidateEntitlements(workspaceId: string, db: Executor = getDb()): Promise<void> {
  cache().delete(workspaceId)
  await db.update(workspaces).set({ entitlementsVersion: sql`${workspaces.entitlementsVersion} + 1` }).where(eq(workspaces.id, workspaceId))
}

export async function can(workspaceId: string, feature: FeatureKey, db?: Executor): Promise<boolean> {
  return (await getEntitlements(workspaceId, undefined, db)).features[feature]
}

/** 402 PLAN_REQUIRED. Call after the role check (role = 403 first). */
export async function requireEntitlement(ctx: Pick<WorkspaceContext, 'workspaceId' | 'db'>, feature: FeatureKey): Promise<void> {
  if (!(await can(ctx.workspaceId, feature, ctx.db))) {
    throw appError(402, 'Fitur ini belum termasuk di paket kamu. Upgrade untuk memakainya.', 'PLAN_REQUIRED', { feature })
  }
}
