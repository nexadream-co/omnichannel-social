import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createRule, listActivity, setRuleActive, testRule, type RuleInput } from '../../server/core/autoreply/rules'
import { ingestMetaWebhook, verifyMetaSignature, verifySubscription } from '../../server/core/autoreply/webhook'
import { fakeOutbox, resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { dmEvents, jobs, notifications, plans, socialAccounts, subscriptions, users } from '../../server/core/db/schema'
import { invalidateEntitlements } from '../../server/core/entitlements'
import { resetEnvCache } from '../../server/core/env'
import { runDue } from '../../server/core/jobs'
import { createLink } from '../../server/core/links/service'
import { provisionWorkspace } from '../../server/core/registration'
import { setSetting } from '../../server/core/settings'
import { connectAccounts } from '../../server/core/social-accounts'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
let igId: string
const IG_EXTERNAL = 'ig-17841400000000001'

async function run(times = 2) {
  for (let i = 0; i < times; i++) {
    await getDb().update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, 'queued'))
    const base = testContext()
    await runDue({ ...base, db: getDb() }, { budgetMs: 60_000 })
    await base.flush()
  }
}

let seq = 0
function comment(text: string, overrides: { commentId?: string, from?: string, username?: string, media?: string, time?: number } = {}) {
  seq++
  return {
    object: 'instagram',
    entry: [{
      id: IG_EXTERNAL, time: overrides.time ?? Math.floor(Date.now() / 1000),
      changes: [{ field: 'comments', value: { id: overrides.commentId ?? `c-${seq}`, text, from: { id: overrides.from ?? `u-${seq}`, username: overrides.username ?? `fan${seq}` }, media: { id: overrides.media ?? 'm-1' } } }]
    }]
  }
}

const rule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  socialAccountId: igId, scope: 'global', keywords: ['mau'], matchMode: 'contains', dmMessage: 'Hai {nama}! Ini linknya: {link}',
  publicReplyVariants: ['Cek DM ya kak!'], active: true, ...overrides
})

async function plan(slug: 'gratis' | 'kreator') {
  await getDb().update(subscriptions).set({ planId: `plan-${slug}`, status: slug === 'gratis' ? 'downgraded' : 'active' }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
  await invalidateEntitlements(ctx.workspaceId)
}

const events = () => getDb().select().from(dmEvents)
const dms = () => fakeOutbox.filter(m => m.kind === 'dm')

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  process.env.INSTAGRAM_APP_SECRET = 'ig-secret'
  process.env.META_APP_SECRET = 'fb-secret'
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-me'
  resetEnvCache()
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('dm_events', 'dm_rules', 'webhook_events', 'jobs', 'link_clicks', 'short_links', 'links', 'social_accounts', 'notifications', 'rate_limit_buckets', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
  await setSetting('channels.autoReply.enabled', 'true') // settings are cached in memory; truncate alone doesn't reset them
  await plan('kreator')
  ;[igId] = (await connectAccounts(ctx, 'instagram', [{ externalId: IG_EXTERNAL, username: 'rina.shop', avatarUrl: null, accessToken: 'tok', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])).connected
})
afterAll(closeDb)

describe('Meta webhook intake', () => {
  it('verifies the subscription token and the signature with the secret for the payload object', () => {
    expect(verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' })).toBe('42')
    expect(verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' })).toBeNull()
    const raw = Buffer.from(JSON.stringify(comment('mau')))
    const sign = (secret: string) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
    expect(verifyMetaSignature(raw, sign('ig-secret'), 'instagram')).toBe(true)
    expect(verifyMetaSignature(raw, sign('fb-secret'), 'instagram')).toBe(false) // Instagram-Login uses the Instagram app secret
    expect(verifyMetaSignature(raw, sign('fb-secret'), 'page')).toBe(true)
    expect(verifyMetaSignature(raw, undefined, 'instagram')).toBe(false)
  })

  it('a matching comment produces one DM and a public reply; a replayed webhook never sends again', async () => {
    const { link } = await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/abc', showInBio: false })
    await createRule(ctx, rule({ linkId: link.id }))
    const payload = comment('Mau kak!!', { commentId: 'c-replay', username: 'budi' })
    expect(await ingestMetaWebhook(getDb(), payload)).toHaveLength(1)
    await run()
    expect(await ingestMetaWebhook(getDb(), payload)).toHaveLength(0) // deduped at the door
    await run()
    expect(dms()).toHaveLength(1)
    expect(dms()[0]!.text).toMatch(/^Hai @budi! Ini linknya: http.+\/[\w-]+$/)
    expect(dms()[0]!.text).not.toContain(link.shortUrl!) // DM clicks get their own short link (source dm)
    expect(fakeOutbox.filter(m => m.kind === 'reply')).toHaveLength(1)
    expect((await events()).map(e => e.status)).toEqual(['dm_sent'])
  })

  it('ignores non-matching comments, own comments and comments older than 7 days', async () => {
    await createRule(ctx, rule())
    await ingestMetaWebhook(getDb(), comment('maumere indah'))
    await ingestMetaWebhook(getDb(), comment('mau', { from: IG_EXTERNAL }))
    await ingestMetaWebhook(getDb(), comment('mau', { time: Math.floor(Date.now() / 1000) - 8 * 86_400 }))
    await run()
    expect(await events()).toHaveLength(0)
    expect(dms()).toHaveLength(0)
  })

  it('one DM per commenter per rule; post-scoped rules win over global ones', async () => {
    await createRule(ctx, rule({ name: 'global' }))
    const scoped = await createRule(ctx, rule({ name: 'post', scope: 'post', externalMediaId: 'm-9', keywords: [] }))
    await ingestMetaWebhook(getDb(), comment('mau', { from: 'same' }))
    await ingestMetaWebhook(getDb(), comment('mau dong', { from: 'same' }))
    await ingestMetaWebhook(getDb(), comment('keren banget', { media: 'm-9' }))
    await run()
    const rows = await events()
    expect(rows.filter(e => e.status === 'dm_sent')).toHaveLength(2)
    expect(rows.filter(e => e.status === 'skipped_dup')).toHaveLength(1)
    expect(rows.find(e => e.mediaId === 'm-9')!.ruleId).toBe(scoped.id)
  })
})

describe('DM guards', () => {
  it('kill switch defers instead of sending', async () => {
    await createRule(ctx, rule())
    await setSetting('channels.autoReply.enabled', 'false')
    await ingestMetaWebhook(getDb(), comment('mau'))
    await run(1)
    expect(dms()).toHaveLength(0)
    expect((await events())[0]!.status).toBe('matched')
    const [job] = await getDb().select().from(jobs).where(eq(jobs.queue, 'dm.send'))
    expect(job!.status).toBe('queued')
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now() + 5 * 60_000)
  })

  it('stops at the plan allowance and tells the owner once', async () => {
    await createRule(ctx, rule({ keywords: [], scope: 'post', externalMediaId: 'm-1' }))
    const free = SEED_PLANS.find(p => p.slug === 'kreator')!
    await getDb().update(plans).set({ limits: { ...free.limits, autoReplyDmsPerMonth: 1 } }).where(eq(plans.id, 'plan-kreator'))
    await invalidateEntitlements(ctx.workspaceId)
    for (let i = 0; i < 3; i++) await ingestMetaWebhook(getDb(), comment('halo'))
    await run()
    const rows = await events()
    expect(rows.filter(e => e.status === 'dm_sent')).toHaveLength(1)
    expect(rows.filter(e => e.status === 'rate_limited' && e.error === 'plan_limit')).toHaveLength(2)
    expect(await getDb().select().from(notifications)).toHaveLength(1)
    await getDb().update(plans).set({ limits: free.limits }).where(eq(plans.id, 'plan-kreator'))
  })

  it('a daily cap per rule and an account that needs reconnecting are explained, not sent', async () => {
    await createRule(ctx, rule({ dailyCap: 1 }))
    await ingestMetaWebhook(getDb(), comment('mau'))
    await ingestMetaWebhook(getDb(), comment('mau'))
    await run()
    expect((await events()).map(e => e.error).sort()).toEqual(['daily_cap', null].sort())
    await getDb().update(socialAccounts).set({ status: 'needs_reauth' }).where(eq(socialAccounts.id, igId))
    await ingestMetaWebhook(getDb(), comment('mau'))
    await run()
    expect((await events()).filter(e => e.error === 'account_inactive')).toHaveLength(1)
  })

  it('an auth failure marks the account for reconnecting', async () => {
    await createRule(ctx, rule())
    await ingestMetaWebhook(getDb(), comment('mau', { commentId: 'c-fail-auth' }))
    await run()
    expect((await events())[0]).toMatchObject({ status: 'failed', error: 'auth' })
    expect((await getDb().select().from(socialAccounts).where(eq(socialAccounts.id, igId)))[0]!.status).toBe('needs_reauth')
  })
})

describe('rules', () => {
  it('activating counts against the plan (402) and drafts are free', async () => {
    await plan('gratis')
    await createRule(ctx, rule())
    await expect(createRule(ctx, rule({ keywords: ['harga'] }))).rejects.toMatchObject({ statusCode: 402 })
    const draft = await createRule(ctx, rule({ keywords: ['harga'], active: false }))
    await expect(setRuleActive(ctx, draft.id, true)).rejects.toMatchObject({ statusCode: 402 })
  })

  it('global rules need a keyword; "Coba" previews without sending', async () => {
    await expect(createRule(ctx, rule({ keywords: [] }))).rejects.toMatchObject({ statusCode: 400 })
    const preview = await testRule(ctx, { comment: 'MAU dong kak', keywords: ['mau'], matchMode: 'contains', dmMessage: 'Hai {nama}!', linkId: null })
    expect(preview).toEqual({ matches: true, message: 'Hai @pengikutmu!' })
    expect((await testRule(ctx, { comment: 'mau dong', keywords: ['mau'], matchMode: 'exact', dmMessage: 'x', linkId: null })).matches).toBe(false)
    expect(dms()).toHaveLength(0)
  })

  it('activity lists what happened, newest first', async () => {
    await createRule(ctx, rule())
    await ingestMetaWebhook(getDb(), comment('mau', { username: 'sari' }))
    await run()
    const activity = await listActivity(ctx, { page: 1, limit: 25, status: 'all' })
    expect(activity.items[0]).toMatchObject({ commenterUsername: 'sari', status: 'dm_sent', commentText: 'mau' })
    expect(activity.meta.total).toBe(1)
  })
})
