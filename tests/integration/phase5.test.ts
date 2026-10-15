import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { exportWorkspaceData, requestWorkspaceDeletion } from '../../server/core/account'
import { systemContext, type WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { dataDeletionRequests, dmEvents, plans, socialAccounts, subscriptions, users, workspaceInvitations, workspaceMembers } from '../../server/core/db/schema'
import { dataDeletionJob } from '../../server/core/meta-callbacks'
import { provisionWorkspace, type SignUpPort } from '../../server/core/registration'
import { acceptInvitation, inviteMember, previewInvitation, updateMember } from '../../server/core/team'
import { sha256 } from '../../server/core/crypto'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

const fakeAuth: SignUpPort = {
  async signUp(input) {
    const [row] = await getDb().insert(users).values({ name: input.name, email: input.email }).returning({ id: users.id })
    return { userId: row!.id, setCookie: ['socialz.session_token=x'] }
  },
  async deleteUser(userId) {
    await getDb().delete(users).where(eq(users.id, userId))
  }
}

async function ownerWorkspace(email: string, planId = 'plan-pro'): Promise<WorkspaceContext> {
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Owner', email }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Toko', email })
  await getDb().update(subscriptions).set({ planId, status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  return { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
}

/** The invite email carries the raw token; tests read it back by re-hashing a known token. */
async function inviteAndGetToken(ctx: WorkspaceContext, email: string, role: 'editor' | 'viewer' = 'editor') {
  await inviteMember(ctx, { email, role })
  const token = `test-token-${email}`
  await getDb().update(workspaceInvitations).set({ tokenHash: sha256(token) }).where(eq(workspaceInvitations.email, email))
  return token
}

beforeAll(async () => {
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('workspace_invitations', 'dm_events', 'social_accounts', 'data_deletion_requests', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'audit_logs', 'notifications', 'jobs')
})
afterAll(closeDb)

describe('team', () => {
  it('is a paid feature: 402 on a plan without teamAccess, role check first', async () => {
    const ctx = await ownerWorkspace('o1@x.id', 'plan-kreator')
    await expect(inviteMember(ctx, { email: 'a@x.id', role: 'editor' })).rejects.toMatchObject({ statusCode: 402, data: { code: 'PLAN_REQUIRED' } })
    await expect(inviteMember({ ...ctx, role: 'editor' }, { email: 'a@x.id', role: 'editor' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('invites, accepts with a new account, and enforces the seat limit (owner counts)', async () => {
    const ctx = await ownerWorkspace('o2@x.id') // Pro: 3 seats
    const token = await inviteAndGetToken(ctx, 'editor@x.id')
    expect((await previewInvitation(ctx, token)).needsPassword).toBe(true)
    const result = await acceptInvitation(ctx, { token, name: 'Editor', password: 'rahasia123' }, new Headers(), fakeAuth)
    expect(result.signInRequired).toBe(false)
    const [editor] = await getDb().select().from(users).where(eq(users.email, 'editor@x.id'))
    expect(editor!.emailVerified).toBe(true)
    await expect(acceptInvitation(ctx, { token, name: 'Again', password: 'rahasia123' }, new Headers(), fakeAuth)).rejects.toMatchObject({ statusCode: 400 })
    await inviteMember(ctx, { email: 'viewer@x.id', role: 'viewer' }) // seat 3 (pending)
    await expect(inviteMember(ctx, { email: 'fourth@x.id', role: 'viewer' })).rejects.toMatchObject({ statusCode: 402, data: { code: 'LIMIT_REACHED' } })
  })

  it('refuses an address that belongs to another workspace, telling the inviter only that', async () => {
    await ownerWorkspace('busy@x.id')
    const ctx = await ownerWorkspace('o3@x.id')
    await expect(inviteMember(ctx, { email: 'busy@x.id', role: 'editor' })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Email ini sudah terdaftar di akun Socialz.id lain.' })
  })

  it('never edits the owner or yourself', async () => {
    const ctx = await ownerWorkspace('o4@x.id')
    const [owner] = await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
    await expect(updateMember(ctx, owner!.id, { role: 'viewer' })).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('owner data rights', () => {
  it('accepts one deletion request and refuses a second', async () => {
    const ctx = await ownerWorkspace('o5@x.id')
    expect((await requestWorkspaceDeletion(ctx, { confirmation: true })).slaDays).toBe(30)
    await expect(requestWorkspaceDeletion(ctx, { confirmation: true })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('exports without tokens', async () => {
    const ctx = await ownerWorkspace('o6@x.id')
    await getDb().insert(socialAccounts).values({ workspaceId: ctx.workspaceId, platform: 'instagram', externalId: 'ig1', accessTokenEnc: 'enc:v1:secret' })
    const { data } = await exportWorkspaceData(ctx)
    expect(JSON.stringify(data)).not.toContain('enc:v1:secret')
    expect(data.socialAccounts).toHaveLength(1)
  })
})

describe('Meta data deletion job', () => {
  it('revokes the account, drops tokens and DM events, and completes the request', async () => {
    const ctx = await ownerWorkspace('o7@x.id')
    const [account] = await getDb().insert(socialAccounts).values({ workspaceId: ctx.workspaceId, platform: 'instagram', externalId: 'ig-77', username: 'rina', accessTokenEnc: 'enc:v1:x' }).returning()
    await getDb().insert(dmEvents).values({ workspaceId: ctx.workspaceId, socialAccountId: account!.id, commentId: 'c1', commenterId: 'u1', commentText: 'mau' })
    const [request] = await getDb().insert(dataDeletionRequests).values({ platform: 'instagram', platformUserId: 'ig-77', confirmationCode: 'abc' }).returning()
    const job = { id: 'j', queue: 'meta.data_deletion', payload: { requestId: request!.id }, workspaceId: null, attempts: 1, maxAttempts: 5, runAt: new Date() }
    await dataDeletionJob(job, systemContext(ctx.workspaceId, ctx))
    await dataDeletionJob(job, systemContext(ctx.workspaceId, ctx)) // idempotent
    const [after] = await getDb().select().from(socialAccounts).where(eq(socialAccounts.id, account!.id))
    expect(after).toMatchObject({ status: 'revoked', accessTokenEnc: null, username: null })
    expect(await getDb().select().from(dmEvents)).toHaveLength(0)
    const [done] = await getDb().select().from(dataDeletionRequests).where(eq(dataDeletionRequests.id, request!.id))
    expect(done!.status).toBe('completed')
  })
})
