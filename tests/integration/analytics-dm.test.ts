import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { workspaceAnalytics } from '../../server/core/analytics/service'
import { createRule, deleteRule, type RuleInput } from '../../server/core/autoreply/rules'
import { ingestMetaWebhook } from '../../server/core/autoreply/webhook'
import { fakeOutbox, resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { dmEvents, insightSnapshots, jobs, linkClicks, plans, posts, postTargets, shortLinks, subscriptions, users } from '../../server/core/db/schema'
import { invalidateEntitlements } from '../../server/core/entitlements'
import { resetEnvCache } from '../../server/core/env'
import { runDue } from '../../server/core/jobs'
import { recordClick } from '../../server/core/links/clicks'
import { attributeCaption, createLink, dmShortLinkFor } from '../../server/core/links/service'
import { provisionWorkspace } from '../../server/core/registration'
import { setSetting } from '../../server/core/settings'
import { connectAccounts } from '../../server/core/social-accounts'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
let igId: string
let linkId: string
let vaultUrl: string
const IG_EXTERNAL = 'ig-17841400000000001'
const HOUR = 3_600_000

async function run() {
  await getDb().update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, 'queued'))
  const base = testContext()
  await runDue({ ...base, db: getDb() }, { budgetMs: 60_000 })
  await base.flush()
}

let seq = 0
function comment(text: string, media: string) {
  seq++
  return {
    object: 'instagram',
    entry: [{ id: IG_EXTERNAL, time: Math.floor(Date.now() / 1000), changes: [{ field: 'comments', value: { id: `c-${seq}`, text, from: { id: `u-${seq}`, username: `fan${seq}` }, media: { id: media } } }] }]
  }
}

const rule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  socialAccountId: igId, scope: 'global', keywords: ['mau'], matchMode: 'contains', dmMessage: 'Hai {nama}! {link}', publicReplyVariants: [], active: true, linkId, ...overrides
})

async function plan(slug: 'gratis' | 'kreator') {
  await getDb().update(subscriptions).set({ planId: `plan-${slug}`, status: slug === 'gratis' ? 'downgraded' : 'active' }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
  await invalidateEntitlements(ctx.workspaceId)
}

async function publishedTarget(externalId: string, publishedAt: Date, platform: 'instagram' | 'facebook' = 'instagram') {
  const [post] = await getDb().insert(posts).values({ workspaceId: ctx.workspaceId, baseCaption: `Post ${externalId}`, status: 'published' }).returning({ id: posts.id })
  const [target] = await getDb().insert(postTargets).values({ workspaceId: ctx.workspaceId, postId: post!.id, socialAccountId: igId, platform, format: 'feed', status: 'published', externalId, publishedAt }).returning({ id: postTargets.id, postId: postTargets.postId })
  return target!
}

const insight = (postTargetId: string, metrics: Record<string, number>) => getDb().insert(insightSnapshots).values({ workspaceId: ctx.workspaceId, postTargetId, metrics })
const click = (shortLinkId: string, n = 1) => Promise.all(Array.from({ length: n }, () => recordClick(getDb(), {
  shortLinkId, workspaceId: ctx.workspaceId, ip: null, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Instagram 300.0', method: 'GET', purpose: null, referrer: null, country: 'ID', region: null, city: null
})))
const dmLinks = () => getDb().select().from(shortLinks).where(eq(shortLinks.source, 'dm'))

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  process.env.INSTAGRAM_APP_SECRET = 'ig-secret'
  resetEnvCache()
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('insight_snapshots', 'post_targets', 'posts', 'dm_events', 'dm_rules', 'webhook_events', 'jobs', 'link_clicks', 'short_links', 'links', 'social_accounts', 'notifications', 'rate_limit_buckets', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
  await setSetting('channels.autoReply.enabled', 'true')
  await plan('kreator')
  ;[igId] = (await connectAccounts(ctx, 'instagram', [{ externalId: IG_EXTERNAL, username: 'rina.shop', avatarUrl: null, accessToken: 'tok', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])).connected
  const { link } = await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/abc', showInBio: false })
  linkId = link.id
  vaultUrl = link.shortUrl!
})
afterAll(closeDb)

describe('DM short links per rule and post', () => {
  it('ties a DM link to the rule, the published post and the channel; reuses it; separates rules; coexists with the caption link', async () => {
    const target = await publishedTarget('m-1', new Date(Date.now() - 2 * HOUR))
    const captionText = await attributeCaption(getDb(), { id: target.id, workspaceId: ctx.workspaceId, platform: 'instagram' }, `Beli ${vaultUrl}`)
    const a = await createRule(ctx, rule({ name: 'A' }))
    const b = await createRule(ctx, rule({ name: 'B', keywords: ['beli'] }))
    await ingestMetaWebhook(getDb(), comment('mau', 'm-1'))
    await ingestMetaWebhook(getDb(), comment('mau', 'm-1')) // another commenter, same rule and post
    await ingestMetaWebhook(getDb(), comment('beli', 'm-1'))
    await ingestMetaWebhook(getDb(), comment('mau', 'm-never-published'))
    await run()
    await run()
    expect(fakeOutbox.filter(m => m.kind === 'dm')).toHaveLength(4)
    const rows = await dmLinks()
    expect(rows).toHaveLength(3)
    const ruleA = rows.filter(r => r.dmRuleId === a.id)
    expect(ruleA).toHaveLength(2)
    expect(ruleA.find(r => r.postTargetId === target.id)).toMatchObject({ channel: 'instagram', linkId, workspaceId: ctx.workspaceId })
    expect(ruleA.find(r => r.postTargetId === null)).toBeTruthy()
    expect(rows.filter(r => r.dmRuleId === b.id)).toMatchObject([{ postTargetId: target.id }])
    const caption = (await getDb().select().from(shortLinks).where(eq(shortLinks.source, 'post')))
    expect(caption).toHaveLength(1)
    expect(captionText).toContain(caption[0]!.slug)
    // Attributing the caption again still finds the caption link, never a DM link.
    expect(await attributeCaption(getDb(), { id: target.id, workspaceId: ctx.workspaceId, platform: 'instagram' }, `Beli ${vaultUrl}`)).toBe(captionText)
  })

  it('is safe under concurrent sends', async () => {
    const target = await publishedTarget('m-1', new Date(Date.now() - 2 * HOUR))
    const r = await createRule(ctx, rule())
    const input = { workspaceId: ctx.workspaceId, ruleId: r.id, linkId, socialAccountId: igId, mediaId: 'm-1', channel: 'instagram' }
    const results = await Promise.all(Array.from({ length: 5 }, () => dmShortLinkFor(getDb(), input)))
    expect(new Set(results.map(x => x.id)).size).toBe(1)
    expect(await dmLinks()).toHaveLength(1)
    expect((await dmLinks())[0]!.postTargetId).toBe(target.id)
  })

  it('keeps clicks and redirects working after the rule is deleted', async () => {
    const r = await createRule(ctx, rule())
    const dm = await dmShortLinkFor(getDb(), { workspaceId: ctx.workspaceId, ruleId: r.id, linkId, socialAccountId: igId, mediaId: null, channel: 'instagram' })
    await deleteRule(ctx, r.id)
    expect((await dmLinks())).toHaveLength(1)
    await click(dm.id)
    const data = await workspaceAnalytics(ctx, { days: 7 })
    expect(data.autoReply.clicks).toBe(1)
    expect(data.autoReply.rules).toEqual([])
  })
})

describe('workspaceAnalytics', () => {
  it('previous exists when the plan history covers two windows, null otherwise', async () => {
    const kreator = await workspaceAnalytics(ctx, { days: 7 })
    expect(kreator.previous).toEqual({ clicks: 0, uniques: 0, dmSent: 0 })
    expect(kreator.totals).toEqual({ clicks: 0, uniques: 0 })
    expect((await workspaceAnalytics(ctx, { days: 90 })).previous).not.toBeNull() // 180 days of history = exactly 2 x 90
    await plan('gratis') // 30 days of history
    expect((await workspaceAnalytics(ctx, { days: 7 })).previous).not.toBeNull()
    const wide = await workspaceAnalytics(ctx, { days: 30 })
    expect(wide.window.days).toBe(30)
    expect(wide.previous).toBeNull()
    expect(wide.posting.previousRatePer1000).toBeNull()
  })

  it('counts the period before for clicks and DMs', async () => {
    const dm = await dmShortLinkFor(getDb(), { workspaceId: ctx.workspaceId, ruleId: 'gone', linkId, socialAccountId: igId, mediaId: null, channel: 'instagram' })
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000)
    await click(dm.id, 2)
    await getDb().update(linkClicks).set({ clickedAt: ago(10) }) // everything so far moves into the previous 7 days
    await click(dm.id, 3)
    await getDb().insert(dmEvents).values([
      { workspaceId: ctx.workspaceId, socialAccountId: igId, commentId: 'p1', commenterId: 'x1', status: 'dm_sent', createdAt: ago(10) },
      { workspaceId: ctx.workspaceId, socialAccountId: igId, commentId: 'p2', commenterId: 'x2', status: 'failed', createdAt: ago(10) }
    ])
    const data = await workspaceAnalytics(ctx, { days: 7 })
    expect(data.totals.clicks).toBe(3)
    expect(data.previous).toMatchObject({ clicks: 2, dmSent: 1 })
  })

  it('autoReply: matched, sent, per-rule clicks, and unattributed legacy DM clicks', async () => {
    const a = await createRule(ctx, rule({ name: 'A' }))
    const b = await createRule(ctx, rule({ name: 'B' }))
    await createRule(ctx, rule({ name: 'Quiet' }))
    const mk = (ruleId: string | null, status: 'dm_sent' | 'replied' | 'skipped' | 'matched', n: number) => Array.from({ length: n }, () => ({ workspaceId: ctx.workspaceId, ruleId, socialAccountId: igId, commentId: `e-${seq++}`, commenterId: `c-${seq}`, status }))
    await getDb().insert(dmEvents).values([...mk(a.id, 'dm_sent', 3), ...mk(a.id, 'skipped', 1), ...mk(b.id, 'replied', 1), ...mk(null, 'dm_sent', 1)])
    const dmA = await dmShortLinkFor(getDb(), { workspaceId: ctx.workspaceId, ruleId: a.id, linkId, socialAccountId: igId, mediaId: null, channel: 'instagram' })
    const dmB = await dmShortLinkFor(getDb(), { workspaceId: ctx.workspaceId, ruleId: b.id, linkId, socialAccountId: igId, mediaId: null, channel: 'instagram' })
    const [legacy] = await getDb().insert(shortLinks).values({ workspaceId: ctx.workspaceId, slug: 'legacy1', domain: 'x', linkId, source: 'dm' }).returning({ id: shortLinks.id })
    await click(dmA.id, 2)
    await click(dmB.id, 1)
    await click(legacy!.id, 4)
    const { autoReply } = await workspaceAnalytics(ctx, { days: 7 })
    expect(autoReply).toMatchObject({ matched: 6, sent: 5, clicks: 7, unattributedClicks: 4 })
    expect(autoReply.rules).toEqual([
      { ruleId: a.id, name: 'A', active: true, matched: 4, sent: 3, clicks: 2 },
      { ruleId: b.id, name: 'B', active: true, matched: 1, sent: 1, clicks: 1 }
    ])
  })

  it('posting and topPosts: click rate per 1.000 views, only for posts old enough and seen enough', async () => {
    const old = await publishedTarget('m-old', new Date(Date.now() - 3 * HOUR - 24 * HOUR))
    const fresh = await publishedTarget('m-fresh', new Date(Date.now() - 2 * HOUR))
    const small = await publishedTarget('m-small', new Date(Date.now() - 30 * HOUR))
    await insight(old.id, { views: 500 })
    await insight(old.id, { views: 1000, reach: 900 }) // the latest snapshot counts
    await insight(fresh.id, { views: 1000 })
    await insight(small.id, { views: 50 })
    const link = async (t: { id: string }, n: number) => {
      await attributeCaption(getDb(), { id: t.id, workspaceId: ctx.workspaceId, platform: 'instagram' }, `x ${vaultUrl}`)
      const [row] = await getDb().select().from(shortLinks).where(eq(shortLinks.postTargetId, t.id))
      await click(row!.id, n)
    }
    await link(old, 5)
    await link(fresh, 9)
    await link(small, 2)
    const data = await workspaceAnalytics(ctx, { days: 7 })
    const byPost = (t: { postId: string }) => data.topPosts.find(p => p.postId === t.postId)!
    expect(byPost(old)).toMatchObject({ clicks: 5, views: 1000, ratePer1000: 5 })
    expect(byPost(fresh)).toMatchObject({ clicks: 9, views: 1000, ratePer1000: null }) // younger than 24 hours
    expect(byPost(small)).toMatchObject({ clicks: 2, views: 50, ratePer1000: null }) // too few views
    expect(data.posting).toMatchObject({ published: 3, measured: 2, views: 1050, clicks: 7, ratePer1000: 6.7, previousRatePer1000: null, noViewsPlatforms: [] })
  })

  it('posting: a post without a views number is not measured, Facebook is listed, and DM clicks count for the post', async () => {
    const ig = await publishedTarget('m-1', new Date(Date.now() - 30 * HOUR))
    await publishedTarget('fb-1', new Date(Date.now() - 30 * HOUR), 'facebook')
    await insight(ig.id, { views: 2000 })
    const r = await createRule(ctx, rule())
    const dm = await dmShortLinkFor(getDb(), { workspaceId: ctx.workspaceId, ruleId: r.id, linkId, socialAccountId: igId, mediaId: 'm-1', channel: 'instagram' })
    await click(dm.id, 4)
    const data = await workspaceAnalytics(ctx, { days: 7 })
    expect(data.posting).toMatchObject({ published: 2, measured: 1, views: 2000, clicks: 4, ratePer1000: 2, noViewsPlatforms: ['facebook'] })
    expect(data.topPosts[0]).toMatchObject({ postId: ig.postId, clicks: 4, views: 2000 })
  })

  it('posting.previousRatePer1000 uses posts published in the window before', async () => {
    const prev = await publishedTarget('m-prev', new Date(Date.now() - 10 * 86_400_000))
    await insight(prev.id, { views: 1000 })
    await attributeCaption(getDb(), { id: prev.id, workspaceId: ctx.workspaceId, platform: 'instagram' }, `x ${vaultUrl}`)
    const [row] = await getDb().select().from(shortLinks).where(eq(shortLinks.postTargetId, prev.id))
    await click(row!.id, 3)
    await getDb().update(linkClicks).set({ clickedAt: new Date(Date.now() - 9 * 86_400_000) })
    const data = await workspaceAnalytics(ctx, { days: 7 })
    expect(data.posting).toMatchObject({ published: 0, measured: 0, ratePer1000: null, previousRatePer1000: 3 })
  })
})
