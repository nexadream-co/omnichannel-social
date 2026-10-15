import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { impersonateStaff } from '../../server/core/admin/people'
import { homeSummary } from '../../server/core/analytics/service'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { StaffContext, WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { insightSnapshots, plans, posts, postTargets, roles, staffUsers, users } from '../../server/core/db/schema'
import { inactivityJob, insightsDailyJob } from '../../server/core/engagement-jobs'
import { resetEnvCache } from '../../server/core/env'
import type { ClaimedJob } from '../../server/core/jobs'
import { getPost } from '../../server/core/publishing/service'
import { provisionWorkspace } from '../../server/core/registration'
import { readSession, restoreStaffSessionCookies, STAFF_RETURN_COOKIE } from '../../server/core/services/auth'
import { staffAuth } from '../../server/core/services/auth/staff'
import { connectAccounts } from '../../server/core/social-accounts'
import { PERMISSION_KEYS } from '../../shared/utils/permissions'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
const job = { id: 'j', queue: 'x', payload: {}, workspaceId: null, attempts: 1, maxAttempts: 2, runAt: new Date() } as ClaimedJob

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('insight_snapshots', 'post_targets', 'posts', 'social_accounts', 'staff_sessions', 'staff_users', 'roles', 'jobs', 'notifications', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'audit_logs')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ws = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
})
afterAll(closeDb)

describe('insights.daily', () => {
  it('snapshots published targets once a day and the post detail shows the numbers', async () => {
    const [accountId] = (await connectAccounts(ws, 'instagram', [{ externalId: 'ig-ins', username: 'rina', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])).connected
    const [post] = await getDb().insert(posts).values({ workspaceId: ws.workspaceId, baseCaption: 'x', status: 'published' }).returning()
    await getDb().insert(postTargets).values({ workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: accountId!, platform: 'instagram', format: 'feed', status: 'published', externalId: 'media-1', publishedAt: new Date() })
    const base = testContext()
    await insightsDailyJob(job, base)
    await insightsDailyJob(job, base) // idempotent within the day
    expect(await getDb().select().from(insightSnapshots)).toHaveLength(1)
    const detail = await getPost(ws, post!.id)
    expect(detail.targets[0]).toMatchObject({ insights: { metrics: { views: 120, likes: 12, comments: 3 } }, clicks: 0, autoReplies: 0 })
  })
})

describe('engagement.inactivity', () => {
  it('emails owners whose last activity was exactly 10 local days ago', async () => {
    const base = testContext()
    const sent: string[] = []
    base.defer = (work) => {
      sent.push('email')
      void work.catch(() => undefined)
    }
    await getDb().update(users).set({ lastSeenAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(users.id, ws.userId!))
    await inactivityJob(job, base)
    expect(sent).toHaveLength(1)
    sent.length = 0
    await getDb().update(users).set({ lastSeenAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(users.id, ws.userId!))
    await inactivityJob(job, base)
    expect(sent).toHaveLength(0)
  })
})

describe('home summary', () => {
  it('counts the week and flags accounts needing a reconnect', async () => {
    await connectAccounts(ws, 'threads', [{ externalId: 'th-h', username: 'r', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])
    const { socialAccounts } = await import('../../server/core/db/schema')
    await getDb().update(socialAccounts).set({ status: 'needs_reauth' })
    expect(await homeSummary(ws)).toEqual({ clicks7d: 0, autoReplies7d: 0, topProducts: [], needsReauth: 1 })
  })
})

describe('staff impersonation', () => {
  it('superadmin only, never another superadmin or yourself; the operator session comes back on stop', async () => {
    await getDb().insert(roles).values([{ id: 'role-superadmin', slug: 'superadmin', name: 'Superadmin', isSuperAdmin: true, isSystem: true }, { id: 'role-support', slug: 'support', name: 'Support', isSystem: true }])
    await getDb().insert(staffUsers).values([
      { id: 'boss', name: 'Boss', email: 'boss@x.id', roleId: 'role-superadmin' },
      { id: 'boss2', name: 'Boss 2', email: 'boss2@x.id', roleId: 'role-superadmin' },
      { id: 'sinta', name: 'Sinta', email: 'sinta@x.id', roleId: 'role-support' }
    ])
    const ctx: StaffContext = { ...testContext(), staffUserId: 'boss', staffName: 'Boss', permissions: new Set(PERMISSION_KEYS), isSuperAdmin: true, impersonatorId: null }
    const name = (await staffAuth().$context).authCookies.sessionToken.name
    const header = `${name}=operator-token.signature`
    await expect(impersonateStaff(ctx, 'boss2', header)).rejects.toMatchObject({ statusCode: 403 })
    await expect(impersonateStaff(ctx, 'boss', header)).rejects.toMatchObject({ statusCode: 409 })
    await expect(impersonateStaff({ ...ctx, isSuperAdmin: false }, 'sinta', header)).rejects.toMatchObject({ statusCode: 403 })

    const { setCookies } = await impersonateStaff(ctx, 'sinta', header)
    const session = await readSession(new Headers({ cookie: setCookies[0]!.split(';')[0]! }), 'staff')
    expect(session).toMatchObject({ userId: 'sinta', impersonatedBy: 'boss' })
    expect(setCookies[1]).toContain(`${STAFF_RETURN_COOKIE}=operator-token.signature`)
    const restored = await restoreStaffSessionCookies(`${setCookies[0]!.split(';')[0]}; ${STAFF_RETURN_COOKIE}=operator-token.signature`)
    expect(restored[0]).toContain(`${name}=operator-token.signature`)
    expect(restored[1]).toContain('Max-Age=0')
  })
})
