import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { plans, socialAccounts, subscriptions, users } from '../../server/core/db/schema'
import { provisionWorkspace } from '../../server/core/registration'
import { completeConnectSession, connectAccounts, decryptAccount, disconnectSocialAccount, getConnectSession, handleConnectCallback, startConnect } from '../../server/core/social-accounts'
import { resetEnvCache } from '../../server/core/env'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

async function owner(email: string, planId = 'plan-gratis'): Promise<WorkspaceContext & { emailVerified: boolean }> {
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'O', email, emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'W', email })
  await getDb().update(subscriptions).set({ planId }).where(eq(subscriptions.workspaceId, workspaceId))
  return { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null, emailVerified: true }
}

const account = (externalId: string) => ({ externalId, username: `u${externalId}`, avatarUrl: null, accessToken: `tok-${externalId}`, refreshToken: null, tokenExpiresAt: new Date(Date.now() + 86_400_000), scopes: [], meta: {} })

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('channel_connect_sessions', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'audit_logs', 'rate_limit_buckets')
})
afterAll(closeDb)

describe('connecting social accounts', () => {
  it('needs a verified email and the owner role', async () => {
    const ctx = await owner('a@x.id')
    await expect(startConnect({ ...ctx, emailVerified: false }, 'instagram')).rejects.toMatchObject({ data: { code: 'EMAIL_NOT_VERIFIED' } })
    await expect(startConnect({ ...ctx, role: 'editor' }, 'instagram')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('verifies state, connects one account directly, stores the token encrypted with row-bound AAD', async () => {
    const ctx = await owner('b@x.id')
    const { url, cookie } = await startConnect(ctx, 'instagram')
    const state = new URL(url).searchParams.get('state')!
    await expect(handleConnectCallback(ctx, 'instagram', { code: 'fake-instagram', state }, 'instagram.other')).rejects.toMatchObject({ data: { reason: 'state' } })
    expect(await handleConnectCallback(ctx, 'instagram', { code: 'fake-instagram', state }, cookie)).toEqual({ kind: 'connected', count: 1 })
    const [row] = await getDb().select().from(socialAccounts)
    expect(row!.accessTokenEnc).toMatch(/^enc:v1:/)
    expect(decryptAccount(row!).accessToken).toMatch(/^fake-token-/)
    // A ciphertext copied onto another row does not decrypt.
    expect(() => decryptAccount({ ...row!, id: 'other' })).toThrow()
  })

  it('sends multiple Facebook Pages to the picker, and revives dates from the session (regression)', async () => {
    const ctx = await owner('c@x.id', 'plan-kreator')
    const { url, cookie } = await startConnect(ctx, 'facebook')
    const result = await handleConnectCallback(ctx, 'facebook', { code: 'fake-facebook', state: new URL(url).searchParams.get('state')! }, cookie)
    expect(result.kind).toBe('pick')
    const sessionId = (result as { sessionId: string }).sessionId
    const session = await getConnectSession(ctx, sessionId)
    expect(JSON.stringify(session)).not.toContain('fake-token')
    expect((await completeConnectSession(ctx, sessionId, [session.accounts[0]!.externalId])).connected).toBe(1)
    const [row] = await getDb().select().from(socialAccounts)
    expect(row!.tokenExpiresAt).toBeInstanceOf(Date)
  })

  it('enforces the plan limit for new accounts but not for reconnects; refuses accounts owned elsewhere', async () => {
    const ctx = await owner('d@x.id') // Gratis: 2 accounts
    await connectAccounts(ctx, 'instagram', [account('1')])
    await connectAccounts(ctx, 'threads', [account('2')])
    await expect(connectAccounts(ctx, 'facebook', [account('3')])).rejects.toMatchObject({ statusCode: 402, data: { code: 'LIMIT_REACHED' } })
    await connectAccounts(ctx, 'instagram', [account('1')]) // reconnect: fine
    const other = await owner('e@x.id')
    await expect(connectAccounts(other, 'instagram', [account('1')])).rejects.toMatchObject({ statusCode: 409 })
  })

  it('disconnect deletes tokens and keeps the row', async () => {
    const ctx = await owner('f@x.id')
    const { connected } = await connectAccounts(ctx, 'instagram', [account('9')])
    await disconnectSocialAccount(ctx, connected[0]!)
    const [row] = await getDb().select().from(socialAccounts)
    expect(row).toMatchObject({ status: 'revoked', accessTokenEnc: null })
    // After revoking, the same Instagram account can be connected again (partial unique index).
    await connectAccounts(ctx, 'instagram', [account('9')])
  })
})
