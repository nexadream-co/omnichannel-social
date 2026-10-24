import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createRule, lastLocalDays, listRules, type RuleInput } from '../../server/core/autoreply/rules'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { dmEvents, plans, subscriptions, users } from '../../server/core/db/schema'
import { invalidateEntitlements } from '../../server/core/entitlements'
import { provisionWorkspace } from '../../server/core/registration'
import { setSetting } from '../../server/core/settings'
import { connectAccounts } from '../../server/core/social-accounts'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
let igId: string

const rule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  socialAccountId: igId, scope: 'global', keywords: ['mau'], matchMode: 'contains', dmMessage: 'Hai {nama}! {link}',
  publicReplyVariants: [], active: true, ...overrides
})

beforeAll(async () => {
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('dm_events', 'dm_rules', 'webhook_events', 'jobs', 'link_clicks', 'short_links', 'links', 'social_accounts', 'notifications', 'rate_limit_buckets', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
  await setSetting('channels.autoReply.enabled', 'true')
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  await invalidateEntitlements(workspaceId)
  ;[igId] = (await connectAccounts(ctx, 'instagram', [{ externalId: 'ig-1', username: 'rina.shop', avatarUrl: null, accessToken: 'tok', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])).connected
})
afterAll(closeDb)

describe('lastLocalDays', () => {
  it('returns seven local dates, oldest first, in the workspace timezone', () => {
    // 2026-10-20 18:00 UTC is already the 21st in Jakarta
    const days = lastLocalDays('Asia/Jakarta', new Date('2026-10-20T18:00:00Z'))
    expect(days).toHaveLength(7)
    expect(days.at(-1)).toBe('2026-10-21')
    expect(days[0]).toBe('2026-10-15')
  })
})

describe('listRules daily7d', () => {
  it('counts sent DMs per local day, oldest first, ignoring skipped and old events', async () => {
    const a = await createRule(ctx, rule())
    const b = await createRule(ctx, rule({ keywords: ['harga'] }))
    const base = { workspaceId: ctx.workspaceId, socialAccountId: igId }
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000)
    let n = 0
    const event = (ruleId: string, daysAgo: number, status: 'dm_sent' | 'skipped' = 'dm_sent') => {
      n++
      return { ...base, ruleId, commentId: `c${n}`, commenterId: `u${n}`, status, createdAt: at(daysAgo) } as typeof dmEvents.$inferInsert
    }
    await getDb().insert(dmEvents).values([
      event(a.id, 0), event(a.id, 0), event(a.id, 2), event(a.id, 0, 'skipped'), event(a.id, 8), event(b.id, 1)
    ])
    const items = await listRules(ctx)
    const ra = items.find(r => r.id === a.id)!
    const rb = items.find(r => r.id === b.id)!
    expect(ra.daily7d).toHaveLength(7)
    expect(ra.daily7d.reduce((x, y) => x + y, 0)).toBe(3)
    expect(ra.daily7d[6]).toBeGreaterThanOrEqual(2)
    expect(rb.daily7d.reduce((x, y) => x + y, 0)).toBe(1)
  })

  it('is all zeros for a rule with no DMs', async () => {
    await createRule(ctx, rule())
    expect((await listRules(ctx))[0]!.daily7d).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})
