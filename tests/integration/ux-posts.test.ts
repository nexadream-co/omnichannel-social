import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { homeSummary } from '../../server/core/analytics/service'
import { fakeAdapter, resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { bioPages, jobs, linkClicks, links, mediaAssets, plans, posts, postTargets, shortLinks, socialAccounts, subscriptions, users } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { runDue } from '../../server/core/jobs'
import { setInlinePollDelays } from '../../server/core/publishing/pipeline'
import { createPost, listPosts, postTabCounts, retryTarget } from '../../server/core/publishing/service'
import { provisionWorkspace } from '../../server/core/registration'
import { connectAccounts } from '../../server/core/social-accounts'
import { enforceWorkspaceLimits } from '../../server/core/subscriptions'
import { isOverdue } from '../../shared/utils/overdue'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
let igId: string
let imageId: string

const fakeAccount = (externalId: string, username: string) => ({ externalId, username, avatarUrl: null, accessToken: `tok-${externalId}`, refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} })
const query = (extra: Partial<Parameters<typeof listPosts>[1]> = {}) => ({ page: 1, limit: 20, offset: 0, search: '', tab: 'scheduled' as const, ...extra })
const day = 86_400_000

async function run() {
  await getDb().update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, 'queued'))
  await runDue({ ...testContext(), db: getDb() }, { budgetMs: 60_000 })
}

/** A scheduled post, then moved in time in the database (the API refuses a past time). */
async function scheduled(caption: string, at: Date) {
  const { postId } = await createPost(ctx, { caption, mediaIds: [imageId], targets: [{ socialAccountId: igId }], mode: 'schedule', scheduledAt: new Date(Date.now() + 2 * day).toISOString() })
  await getDb().update(posts).set({ scheduledAt: at }).where(eq(posts.id, postId))
  await getDb().update(postTargets).set({ scheduledAt: at }).where(eq(postTargets.postId, postId))
  const [target] = await getDb().select().from(postTargets).where(eq(postTargets.postId, postId))
  return { postId, target: target! }
}

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  setInlinePollDelays([0, 0])
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('link_clicks', 'short_links', 'links', 'bio_pages', 'jobs', 'publish_attempts', 'platform_publish_ledger', 'post_targets', 'post_media', 'posts', 'media_assets', 'social_accounts', 'notifications', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
  ;[igId] = (await connectAccounts(ctx, 'instagram', [fakeAccount('ig-1', 'rina.shop')])).connected
  const [image] = await getDb().insert(mediaAssets).values({ workspaceId, r2Key: `k/${Date.now()}.jpg`, mime: 'image/jpeg', kind: 'image', bytes: 1000, width: 1080, height: 1350, status: 'ready', publicUrl: 'https://media.test/a.jpg' }).returning()
  imageId = image!.id
})
afterAll(closeDb)

describe('isOverdue', () => {
  it('only a scheduled post past the grace window counts', () => {
    const now = Date.now()
    expect(isOverdue('scheduled', new Date(now - 11 * 60_000), now)).toBe(true)
    expect(isOverdue('scheduled', new Date(now - 5 * 60_000), now)).toBe(false)
    expect(isOverdue('published', new Date(now - day), now)).toBe(false)
    expect(isOverdue('scheduled', null, now)).toBe(false)
  })
})

describe('listPosts due filter', () => {
  it('splits upcoming from overdue and flags overdue items', async () => {
    const soon = await scheduled('Besok', new Date(Date.now() + day))
    const late = await scheduled('Kemarin', new Date(Date.now() - day))
    const justNow = await scheduled('Baru saja', new Date(Date.now() - 2 * 60_000))

    const upcoming = await listPosts(ctx, query({ due: 'upcoming' }))
    expect(upcoming.items.map(p => p.id).sort()).toEqual([soon.postId, justNow.postId].sort())
    expect(upcoming.items.every(p => !p.overdue)).toBe(true)

    const overdue = await listPosts(ctx, query({ due: 'overdue' }))
    expect(overdue.items.map(p => p.id)).toEqual([late.postId])
    expect(overdue.items[0]!.overdue).toBe(true)
    expect(overdue.meta.total).toBe(1)

    // Without `due` nothing changes: all three, the overdue one first.
    const all = await listPosts(ctx, query())
    expect(all.items).toHaveLength(3)
    expect(all.items[0]!.id).toBe(late.postId)
  })

  it('targets carry the account status for the reconnect button', async () => {
    await scheduled('Tertunda', new Date(Date.now() - day))
    await getDb().update(socialAccounts).set({ status: 'needs_reauth' }).where(eq(socialAccounts.id, igId))
    const { items } = await listPosts(ctx, query({ due: 'overdue' }))
    expect(items[0]!.targets[0]).toMatchObject({ accountStatus: 'needs_reauth', socialAccountId: igId })
  })
})

describe('postTabCounts', () => {
  it('counts every tab and the overdue subset', async () => {
    await scheduled('Besok', new Date(Date.now() + day))
    await scheduled('Kemarin', new Date(Date.now() - day))
    await createPost(ctx, { caption: 'Draf', mediaIds: [], targets: [{ socialAccountId: igId }], mode: 'draft' })
    expect(await postTabCounts(ctx)).toEqual({ scheduled: 2, overdue: 1, draft: 1, published: 0, failed: 0 })
  })
})

describe('retryTarget on an overdue scheduled target', () => {
  it('cancels the old queued job, enqueues exactly one new job and publishes once', async () => {
    const { target } = await scheduled('Tertunda', new Date(Date.now() - day))
    const { jobId } = await retryTarget(ctx, target.id)
    expect(jobId).not.toBe(target.jobId)
    const all = await getDb().select().from(jobs)
    expect(all.filter(j => j.status === 'queued')).toHaveLength(1)
    expect(all.find(j => j.id === target.jobId)!.status).toBe('cancelled')
    await run()
    const published = await fakeAdapter('instagram').findRecent({ account: { externalId: 'ig-1' } as never, fetch, log: ctx.log }, new Date(0))
    expect(published).toHaveLength(1)
    expect((await getDb().select().from(postTargets).where(eq(postTargets.id, target.id)))[0]!.status).toBe('published')
  })

  it('still works when the old job already finished (reconnect left a target with no live job)', async () => {
    const { target } = await scheduled('Setelah hubungkan ulang', new Date(Date.now() - day))
    await getDb().update(jobs).set({ status: 'done', finishedAt: new Date() }).where(eq(jobs.id, target.jobId!))
    await retryTarget(ctx, target.id)
    expect((await getDb().select().from(jobs).where(eq(jobs.status, 'queued')))).toHaveLength(1)
  })

  it('refuses a scheduled target that is not overdue', async () => {
    const { target } = await scheduled('Besok', new Date(Date.now() + day))
    await expect(retryTarget(ctx, target.id)).rejects.toMatchObject({ statusCode: 409 })
    expect(await getDb().select().from(jobs).where(and(eq(jobs.id, target.jobId!), eq(jobs.status, 'queued')))).toHaveLength(1)
  })

  it('refuses while the target job is running, and leaves it alone', async () => {
    const { target } = await scheduled('Sedang jalan', new Date(Date.now() - day))
    await getDb().update(jobs).set({ status: 'running', attempts: 1, leaseUntil: new Date(Date.now() + 60_000) }).where(eq(jobs.id, target.jobId!))
    await expect(retryTarget(ctx, target.id)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Postingan ini sedang diproses.' })
    const all = await getDb().select().from(jobs)
    expect(all).toHaveLength(1)
    expect(all[0]!.status).toBe('running')
  })
})

describe('retryTarget concurrency', () => {
  it('two parallel retries leave exactly one live job and publish once', async () => {
    const { target } = await scheduled('Dua perangkat', new Date(Date.now() - day))
    const results = await Promise.allSettled([retryTarget(ctx, target.id), retryTarget(ctx, target.id, { staff: true })])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } })
    const live = (await getDb().select().from(jobs)).filter(j => ['queued', 'running'].includes(j.status))
    expect(live).toHaveLength(1)
    await run()
    const published = await fakeAdapter('instagram').findRecent({ account: { externalId: 'ig-1' } as never, fetch, log: ctx.log }, new Date(0))
    expect(published).toHaveLength(1)
  })
})

describe('enforceWorkspaceLimits', () => {
  it('cancels the queued publish job of a target that goes back to draft', async () => {
    await connectAccounts(ctx, 'instagram', [fakeAccount('ig-2', 'b'), fakeAccount('ig-3', 'c')])
    const [third] = await getDb().select().from(socialAccounts).where(eq(socialAccounts.externalId, 'ig-3'))
    const { postId } = await createPost(ctx, { caption: 'Akun lebih', mediaIds: [imageId], targets: [{ socialAccountId: third!.id }], mode: 'schedule', scheduledAt: new Date(Date.now() + 2 * day).toISOString() })
    const [target] = await getDb().select().from(postTargets).where(eq(postTargets.postId, postId))
    await getDb().update(subscriptions).set({ planId: 'plan-gratis', status: 'downgraded' }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
    await enforceWorkspaceLimits({ ...testContext(), db: getDb() }, ctx.workspaceId)
    expect((await getDb().select().from(postTargets).where(eq(postTargets.id, target!.id)))[0]!.status).toBe('draft')
    expect((await getDb().select().from(jobs).where(eq(jobs.id, target!.jobId!)))[0]!.status).toBe('cancelled')
  })
})

describe('homeSummary additions', () => {
  it('is empty and null for a new workspace', async () => {
    expect(await homeSummary(ctx)).toMatchObject({ clicks7d: 0, clicksTotal: 0, firstPublished: null, bioUrl: null, overdueCount: 0 })
  })

  it('reports all-time human clicks, the first published post, the Etalase address and overdue posts', async () => {
    const { postId, target } = await scheduled('Pertama', new Date(Date.now() - day))
    await scheduled('Tertunda lagi', new Date(Date.now() - 2 * day))
    await getDb().update(postTargets).set({ status: 'published', publishedAt: new Date(Date.now() - 3600_000), permalink: 'https://instagram.com/p/abc' }).where(eq(postTargets.id, target.id))
    await getDb().update(posts).set({ status: 'published' }).where(eq(posts.id, postId))
    await getDb().insert(bioPages).values({ workspaceId: ctx.workspaceId, handle: 'rina', published: true })
    const [link] = await getDb().insert(links).values({ workspaceId: ctx.workspaceId, destinationUrl: 'https://shopee.co.id/x' }).returning()
    const [short] = await getDb().insert(shortLinks).values({ workspaceId: ctx.workspaceId, slug: 'abc1234', domain: 'go.test', linkId: link!.id }).returning()
    const at = (ms: number) => new Date(Date.now() - ms)
    await getDb().insert(linkClicks).values([
      { workspaceId: ctx.workspaceId, shortLinkId: short!.id, clickedAt: at(1000) },
      { workspaceId: ctx.workspaceId, shortLinkId: short!.id, clickedAt: at(30 * day) },
      { workspaceId: ctx.workspaceId, shortLinkId: short!.id, clickedAt: at(1000), isBot: true }
    ])
    const summary = await homeSummary(ctx)
    expect(summary.clicks7d).toBe(1)
    expect(summary.clicksTotal).toBe(2)
    expect(summary.firstPublished).toMatchObject({ postId, platform: 'instagram', permalink: 'https://instagram.com/p/abc' })
    expect(summary.bioUrl).toContain('rina')
    expect(summary.overdueCount).toBe(1)
  })
})
