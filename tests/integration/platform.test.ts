import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../../server/core/db/client'
import { plans, subscriptionEvents, subscriptions, trialClaims, users, workspaceMembers, workspaces } from '../../server/core/db/schema'
import { getEntitlements, invalidateEntitlements } from '../../server/core/entitlements'
import { consumeRateLimit } from '../../server/core/rate-limit'
import { provisionWorkspace, uniqueWorkspaceSlug } from '../../server/core/registration'
import { claimSettingValue, getSetting, invalidateSettingsCache, setSetting } from '../../server/core/settings'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

async function seedPlans() {
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
}

async function user(email: string) {
  const [row] = await getDb().insert(users).values({ name: 'Rina', email }).returning({ id: users.id })
  return row!.id
}

beforeAll(seedPlans)
beforeEach(async () => {
  await truncate('trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'rate_limit_buckets', 'app_settings')
  invalidateSettingsCache()
})
afterAll(closeDb)

describe('provisionWorkspace', () => {
  it('creates workspace, owner, trial subscription and signup event in one go, idempotently', async () => {
    const ctx = testContext()
    const userId = await user('rina@example.com')
    const first = await provisionWorkspace(ctx, userId, { name: 'Rina Shop', email: 'Rina@Example.com', timezone: 'Asia/Makassar' })
    expect(first).toMatchObject({ created: true, trialGranted: true, planName: 'Kreator' })
    const again = await provisionWorkspace(ctx, userId, { name: 'Rina Shop', email: 'rina@example.com' })
    expect(again).toMatchObject({ created: false, workspaceId: first.workspaceId })
    const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, first.workspaceId))
    expect(ws).toMatchObject({ slug: 'rina-shop', timezone: 'Asia/Makassar' })
    const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, first.workspaceId))
    expect(sub!.status).toBe('trialing')
    expect((await ctx.db.select().from(subscriptionEvents)).map(e => e.transition)).toEqual(['signup'])
    expect((await ctx.db.select().from(workspaceMembers)).map(m => m.role)).toEqual(['owner'])
  })

  it('grants one trial per email; a second signup with that email starts on Gratis', async () => {
    const ctx = testContext()
    const a = await provisionWorkspace(ctx, await user('a@example.com'), { name: 'A', email: 'dup@example.com' })
    expect(a.trialGranted).toBe(true)
    const b = await provisionWorkspace(ctx, await user('b@example.com'), { name: 'A', email: 'DUP@example.com' })
    expect(b.trialGranted).toBe(false)
    const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, b.workspaceId))
    expect(sub).toMatchObject({ status: 'downgraded', planId: 'plan-gratis' })
    expect(await ctx.db.select().from(trialClaims)).toHaveLength(1)
    expect((await ctx.db.select({ slug: workspaces.slug }).from(workspaces)).map(w => w.slug).sort()).toEqual(['a', 'a-2'])
  })

  it('slugs fall back and stay unique', async () => {
    expect(await uniqueWorkspaceSlug(getDb(), '!!!')).toBe('kreator')
  })
})

describe('entitlements', () => {
  it('a version bump from any instance is seen on the next read', async () => {
    const ctx = testContext()
    const { workspaceId } = await provisionWorkspace(ctx, await user('e@example.com'), { name: 'E', email: 'e@example.com' })
    const before = await getEntitlements(workspaceId)
    expect(before.features.customSlug).toBe(true)
    await ctx.db.update(subscriptions).set({ planId: 'plan-gratis' }).where(eq(subscriptions.workspaceId, workspaceId))
    await invalidateEntitlements(workspaceId)
    const [ws] = await ctx.db.select({ v: workspaces.entitlementsVersion }).from(workspaces).where(eq(workspaces.id, workspaceId))
    const after = await getEntitlements(workspaceId, ws!.v)
    expect(after.features.customSlug).toBe(false)
    expect(after.version).toBe(before.version + 1)
  })
})

describe('rate limit (Postgres fixed window)', () => {
  it('counts across concurrent callers and resets per window', async () => {
    const now = new Date('2026-10-15T00:00:10Z')
    const results = await Promise.all(Array.from({ length: 7 }, () => consumeRateLimit('t:ip', 5, 60_000, getDb(), now)))
    expect(results.filter(r => r.allowed)).toHaveLength(5)
    expect((await consumeRateLimit('t:ip', 5, 60_000, getDb(), new Date('2026-10-15T00:01:10Z'))).allowed).toBe(true)
  })
})

describe('settings', () => {
  it('falls back to the catalog default, stores secrets encrypted, and claims once', async () => {
    expect(await getSetting('billing.gracePeriodDays')).toBe('3')
    await setSetting('email.resendApiKey', 're_secret')
    expect(await getSetting('email.resendApiKey')).toBe('re_secret')
    expect(await claimSettingValue('cron.test', '2026-10-15')).toBe(true)
    expect(await claimSettingValue('cron.test', '2026-10-15')).toBe(false)
    expect(await claimSettingValue('cron.test', '2026-10-16')).toBe(true)
  })
})
