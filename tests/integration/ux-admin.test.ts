import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { remindReconnect } from '../../server/core/admin/operations'
import type { StaffContext, WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { notifications, permissions, plans, postTargets, posts, roles, staffUsers, users } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { provisionWorkspace } from '../../server/core/registration'
import { connectAccounts } from '../../server/core/social-accounts'
import { PERMISSION_KEYS } from '../../shared/utils/permissions'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
let targetId: string
const staffCtx = (permissionKeys: string[]): StaffContext =>
  ({ ...testContext(), staffUserId: 'staff-admin', staffName: 'Admin', permissions: new Set(permissionKeys), isSuperAdmin: false, impersonatorId: null })

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
  for (const key of PERMISSION_KEYS) await getDb().insert(permissions).values({ key, group: key.split('.')[0]!, description: key }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('staff_users', 'roles', 'notifications', 'jobs', 'post_targets', 'posts', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  await getDb().insert(roles).values({ id: 'role-admin', slug: 'admin', name: 'Admin', isSystem: true })
  await getDb().insert(staffUsers).values({ id: 'staff-admin', name: 'Admin', email: 'admin@x.id', roleId: 'role-admin' })
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ws = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
  const [accountId] = (await connectAccounts(ws, 'threads', [{ externalId: 'th-1', username: 'rina', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])).connected
  const [post] = await getDb().insert(posts).values({ workspaceId: ws.workspaceId, baseCaption: 'x', status: 'scheduled' }).returning()
  const [target] = await getDb().insert(postTargets).values({ workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: accountId!, platform: 'threads', format: 'text', status: 'needs_reauth', lastErrorCode: 'auth', scheduledAt: new Date() }).returning()
  targetId = target!.id
})
afterAll(closeDb)

describe('remindReconnect', () => {
  const rows = () => getDb().select().from(notifications).where(and(eq(notifications.workspaceId, ws.workspaceId), eq(notifications.templateKey, 'account_reconnect_needed')))

  it('notifies the owner once per day', async () => {
    const ctx = staffCtx(['publishing.write'])
    await remindReconnect(ctx, targetId)
    await remindReconnect(ctx, targetId)
    const sent = await rows()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.userId).toBe(ws.userId)
    expect(sent[0]!.title).toContain('Threads')
  })

  it('is denied without the permission and for unknown targets', async () => {
    await expect(remindReconnect(staffCtx(['publishing.read']), targetId)).rejects.toMatchObject({ statusCode: 403 })
    expect(await rows()).toHaveLength(0)
    await expect(remindReconnect(staffCtx(['publishing.write']), 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})
