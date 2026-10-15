import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deletePlan, updatePlan } from '../../server/core/admin/plans'
import type { StaffContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { plans, postTargets, posts, socialAccounts, subscriptions, users, workspaces } from '../../server/core/db/schema'
import { assertWithinLimit, entitlementUsage, getEntitlements, invalidateEntitlements, subscriptionGrantsPlan } from '../../server/core/entitlements'
import { provisionWorkspace } from '../../server/core/registration'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

const now = new Date('2026-10-15T12:00:00Z')
const past = new Date('2026-10-01T00:00:00Z')
const future = new Date('2026-11-01T00:00:00Z')

async function workspace(email: string) {
  const [user] = await getDb().insert(users).values({ name: 'O', email }).returning({ id: users.id })
  return (await provisionWorkspace(testContext(), user!.id, { name: 'W', email })).workspaceId
}

function staff(): StaffContext {
  return { ...testContext(), staffUserId: 's', staffName: 'S', permissions: new Set(['plans.read', 'plans.write']), isSuperAdmin: false, impersonatorId: null }
}

beforeAll(async () => {
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('post_targets', 'posts', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'audit_logs', 'app_settings')
})
afterAll(closeDb)

describe('subscriptionGrantsPlan', () => {
  it('honours trial, period and grace', () => {
    const base = { trialEndsAt: null, currentPeriodEnd: null, graceEndsAt: null }
    expect(subscriptionGrantsPlan({ ...base, status: 'trialing', trialEndsAt: future }, now)).toBe(true)
    expect(subscriptionGrantsPlan({ ...base, status: 'trialing', trialEndsAt: past }, now)).toBe(false)
    expect(subscriptionGrantsPlan({ ...base, status: 'active' }, now)).toBe(true)
    expect(subscriptionGrantsPlan({ ...base, status: 'cancelled', currentPeriodEnd: future }, now)).toBe(true)
    expect(subscriptionGrantsPlan({ ...base, status: 'cancelled', currentPeriodEnd: past }, now)).toBe(false)
    expect(subscriptionGrantsPlan({ ...base, status: 'past_due', graceEndsAt: future }, now)).toBe(true)
    expect(subscriptionGrantsPlan({ ...base, status: 'downgraded' }, now)).toBe(false)
    expect(subscriptionGrantsPlan({ ...base, status: 'suspended' }, now)).toBe(false)
  })
})

describe('getEntitlements', () => {
  it('falls back to Gratis the moment a trial lapses, before any billing job runs', async () => {
    const id = await workspace('t@x.id')
    const during = await getEntitlements(id)
    expect(during).toMatchObject({ planSlug: 'kreator', effectivePlanSlug: 'kreator', isTrialing: true, trialDaysRemaining: 14 })
    await getDb().update(subscriptions).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(subscriptions.workspaceId, id))
    await invalidateEntitlements(id)
    const after = await getEntitlements(id)
    expect(after).toMatchObject({ planSlug: 'kreator', effectivePlanSlug: 'gratis', planName: 'Gratis', isTrialing: false })
    expect(after.limits.socialAccounts).toBe(2)
  })

  it('writes the limit message in plain words', async () => {
    const id = await workspace('m@x.id')
    await getDb().update(subscriptions).set({ planId: 'plan-gratis', status: 'downgraded' }).where(eq(subscriptions.workspaceId, id))
    await invalidateEntitlements(id)
    await expect(assertWithinLimit({ workspaceId: id, db: getDb() }, 'socialAccounts', 2))
      .rejects.toMatchObject({ statusCode: 402, statusMessage: 'Paket Gratis hanya mengizinkan 2 akun media sosial. Upgrade untuk menambah lagi.' })
  })
})

describe('usage', () => {
  it('counts scheduled targets in the current month on the workspace clock, excluding drafts', async () => {
    const id = await workspace('u@x.id')
    await getDb().update(workspaces).set({ timezone: 'Asia/Jayapura' }).where(eq(workspaces.id, id))
    const [account] = await getDb().insert(socialAccounts).values({ workspaceId: id, platform: 'instagram', externalId: 'ig' }).returning()
    const [post] = await getDb().insert(posts).values({ workspaceId: id }).returning()
    const target = (scheduledAt: Date, status: 'scheduled' | 'draft' | 'published') => ({ workspaceId: id, postId: post!.id, socialAccountId: account!.id, platform: 'instagram' as const, format: 'feed' as const, scheduledAt, status })
    await getDb().insert(postTargets).values([
      target(new Date(), 'scheduled'),
      target(new Date(), 'published'),
      target(new Date(), 'draft'),
      target(new Date(Date.now() - 62 * 86_400_000), 'published')
    ])
    const usage = await entitlementUsage(getDb(), id, 'Asia/Jayapura')
    expect(usage.scheduledPostsPerMonth).toBe(2)
    expect(usage.socialAccounts).toBe(1)
    expect(usage.teamMembers).toBe(1)
  })
})

describe('admin plans', () => {
  it('never deletes the default plan or a plan in use, and PATCH never resets omitted fields', async () => {
    await workspace('p@x.id') // subscribes to kreator
    await expect(deletePlan(staff(), 'plan-gratis')).rejects.toMatchObject({ statusCode: 409 })
    await expect(deletePlan(staff(), 'plan-kreator')).rejects.toMatchObject({ statusCode: 409 })
    await updatePlan(staff(), 'plan-pro', { name: 'Pro+' })
    const [pro] = await getDb().select().from(plans).where(eq(plans.id, 'plan-pro'))
    expect(pro).toMatchObject({ name: 'Pro+', isActive: false, isPublic: false })
    await expect(updatePlan(staff(), 'plan-pro', { slug: 'kreator' })).rejects.toMatchObject({ statusCode: 409 })
    await updatePlan(staff(), 'plan-pro', { name: 'Pro' })
  })
})
