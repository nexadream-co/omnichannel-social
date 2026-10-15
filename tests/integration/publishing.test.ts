import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectAccounts } from '../../server/core/social-accounts'
import { fakeAdapter, resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { jobs, mediaAssets, platformPublishLedger, plans, posts, postTargets, socialAccounts, subscriptions, users } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { runDue } from '../../server/core/jobs'
import { setInlinePollDelays } from '../../server/core/publishing/pipeline'
import { cancelPost, createPost, reschedulePost, retryTarget } from '../../server/core/publishing/service'
import { provisionWorkspace } from '../../server/core/registration'
import { setSetting } from '../../server/core/settings'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
let igId: string
let fbId: string
let imageId: string

const fakeAccount = (externalId: string, username: string) => ({ externalId, username, avatarUrl: null, accessToken: `tok-${externalId}`, refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} })

async function run(times = 1) {
  for (let i = 0; i < times; i++) {
    await getDb().update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, 'queued')) // jump the clock
    await runDue({ ...testContext(), db: getDb() }, { budgetMs: 60_000 })
  }
}
const targetRows = async () => getDb().select().from(postTargets)
const publishedOnFake = async (externalId: string) => fakeAdapter('instagram').findRecent({ account: { externalId } as never, fetch, log: ctx.log }, new Date(0))

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  setInlinePollDelays([0, 0])
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('jobs', 'publish_attempts', 'platform_publish_ledger', 'post_targets', 'post_media', 'posts', 'media_assets', 'social_accounts', 'notifications', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
  ;[igId] = (await connectAccounts(ctx, 'instagram', [fakeAccount('ig-1', 'rina.shop')])).connected
  ;[fbId] = (await connectAccounts(ctx, 'facebook', [fakeAccount('fb-1', 'Toko Rina')])).connected
  const [image] = await getDb().insert(mediaAssets).values({ workspaceId, r2Key: `k/${Date.now()}.jpg`, mime: 'image/jpeg', kind: 'image', bytes: 1000, width: 1080, height: 1350, status: 'ready', publicUrl: 'https://media.test/a.jpg' }).returning()
  imageId = image!.id
})
afterAll(closeDb)

const post = (caption: string, overrides: Partial<Parameters<typeof createPost>[1]> = {}) => createPost(ctx, {
  caption, mediaIds: [imageId], targets: [{ socialAccountId: igId }, { socialAccountId: fbId }], mode: 'now', ...overrides
})

describe('publishing pipeline', () => {
  it('publishes every target once, writes the ledger and derives the post status', async () => {
    const { postId } = await post('Promo hari ini!')
    await run(2)
    const targets = await targetRows()
    expect(targets.map(t => t.status)).toEqual(['published', 'published'])
    expect(targets.every(t => t.externalId && t.permalink)).toBe(true)
    expect(await getDb().select().from(platformPublishLedger)).toHaveLength(2)
    expect((await getDb().select().from(posts).where(eq(posts.id, postId)))[0]!.status).toBe('published')
    expect(await publishedOnFake('ig-1')).toHaveLength(1)
  })

  it('validates with the channel rules before scheduling (422 with issues)', async () => {
    await expect(createPost(ctx, { caption: 'x', mediaIds: [], targets: [{ socialAccountId: igId }], mode: 'now' }))
      .rejects.toMatchObject({ statusCode: 422, data: { code: 'CHANNEL_VALIDATION_FAILED' } })
  })

  it('a rescheduled post publishes once, at the new time; the stale job exits', async () => {
    const at = new Date(Date.now() + 3_600_000).toISOString()
    const { postId } = await post('Jadwal awal', { mode: 'schedule', scheduledAt: at })
    await reschedulePost(ctx, postId, new Date(Date.now() + 7_200_000).toISOString())
    // Force-run everything, including the cancelled/stale ones, by time travel.
    await getDb().update(postTargets).set({ scheduledAt: new Date() })
    await run(2)
    expect((await targetRows()).map(t => t.status)).toEqual(['published', 'published'])
    expect(await publishedOnFake('ig-1')).toHaveLength(1)
  })

  it('a lost media_publish response is reconciled, never re-published', async () => {
    await post('Flash sale [fail:unknown]', { targets: [{ socialAccountId: igId }] })
    await run(1)
    expect((await targetRows())[0]!.status).toBe('publish_unknown')
    await run(1)
    const [target] = await targetRows()
    expect(target!.status).toBe('published')
    expect(await publishedOnFake('ig-1')).toHaveLength(1) // exactly one post went out
  })

  it('an invocation that died after saving step=publishing reconciles instead of re-posting', async () => {
    await post('Crash test', { targets: [{ socialAccountId: igId }] })
    // Simulate: the job was claimed, the target reached publishing, then the invocation died.
    await getDb().update(postTargets).set({ status: 'publishing', step: 'publishing' })
    await getDb().update(jobs).set({ status: 'running', attempts: 1, leaseUntil: new Date(Date.now() - 1000) })
    await run(2)
    // Nothing was actually published, so reconcile can't find it: after its rounds the target fails safely.
    await run(3)
    const [target] = await targetRows()
    expect(['failed', 'publish_unknown']).toContain(target!.status)
    expect(await publishedOnFake('ig-1')).toHaveLength(0)
  })

  it('auth errors pause the target and the account and ask for a reconnect', async () => {
    await post('Token kedaluwarsa [fail:auth]', { targets: [{ socialAccountId: igId }] })
    await run(1)
    expect((await targetRows())[0]!.status).toBe('needs_reauth')
    expect((await getDb().select().from(socialAccounts).where(eq(socialAccounts.id, igId)))[0]!.status).toBe('needs_reauth')
  })

  it('quota: a full 24h ledger defers instead of failing', async () => {
    await getDb().insert(platformPublishLedger).values(Array.from({ length: 50 }, () => ({ workspaceId: ctx.workspaceId, socialAccountId: igId })))
    await post('Kuota penuh', { targets: [{ socialAccountId: igId }] })
    await run(1)
    expect((await targetRows())[0]!.status).toBe('quota_deferred')
    const [job] = await getDb().select().from(jobs).where(and(eq(jobs.queue, 'publish.target'), eq(jobs.status, 'queued')))
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000)
  })

  it('the kill switch defers without failing', async () => {
    await setSetting('channels.publishing.paused', 'true')
    await post('Saat jeda', { targets: [{ socialAccountId: igId }] })
    await run(1)
    expect((await targetRows())[0]!.status).toBe('scheduled')
    await setSetting('channels.publishing.paused', 'false')
    await run(1)
    expect((await targetRows())[0]!.status).toBe('published')
  })

  it('concurrent runners never double-publish', async () => {
    await post('Balapan')
    await getDb().update(jobs).set({ runAt: new Date(0) })
    await Promise.all([1, 2, 3].map(() => runDue({ ...testContext(), db: getDb() }, { budgetMs: 60_000 })))
    await run(1)
    expect(await publishedOnFake('ig-1')).toHaveLength(1)
    expect(await publishedOnFake('fb-1')).toHaveLength(1)
  })

  it('permanent errors fail with a reason; retry resumes and succeeds', async () => {
    await post('Ditolak [fail:permanent]', { targets: [{ socialAccountId: igId }] })
    await run(1)
    const [failed] = await targetRows()
    expect(failed).toMatchObject({ status: 'failed', lastErrorCode: 'permanent' })
    await getDb().update(posts).set({ baseCaption: 'Diperbaiki' })
    await retryTarget(ctx, failed!.id)
    await run(1)
    expect((await targetRows())[0]!.status).toBe('published')
  })

  it('cancel stops a scheduled post', async () => {
    const { postId } = await post('Batal', { mode: 'schedule', scheduledAt: new Date(Date.now() + 3_600_000).toISOString() })
    await cancelPost(ctx, postId)
    await getDb().update(postTargets).set({ scheduledAt: new Date() })
    await run(1)
    expect((await targetRows()).every(t => t.status === 'cancelled')).toBe(true)
    expect(await publishedOnFake('ig-1')).toHaveLength(0)
  })

  it('enforces the monthly allowance per target', async () => {
    await getDb().update(subscriptions).set({ planId: 'plan-gratis', status: 'downgraded' })
    const { invalidateEntitlements } = await import('../../server/core/entitlements')
    await invalidateEntitlements(ctx.workspaceId)
    for (let i = 0; i < 10; i++) await post(`Post ${i}`, { mode: 'schedule', scheduledAt: new Date(Date.now() + 3_600_000).toISOString() }) // 20 targets
    await expect(post('Satu lagi', { mode: 'schedule', scheduledAt: new Date(Date.now() + 3_600_000).toISOString() }))
      .rejects.toMatchObject({ statusCode: 402, data: { code: 'LIMIT_REACHED' } })
  })
})

describe('soak', () => {
  it('50 posts with random crashes and duplicate ticks: zero duplicates, zero lost', async () => {
    const captions = Array.from({ length: 50 }, (_, i) => `Soak ${i}${i % 7 === 0 ? ' [fail:unknown]' : ''}`)
    for (const caption of captions) await post(caption, { targets: [{ socialAccountId: igId }] })
    for (let round = 0; round < 6; round++) {
      // Random chaos: expire some leases as if invocations died, and run overlapping ticks.
      await getDb().execute(`update jobs set status = 'running', lease_until = now() - interval '1 second' where status = 'queued' and random() < 0.1`)
      await getDb().update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, 'queued'))
      await Promise.all([1, 2].map(() => runDue({ ...testContext(), db: getDb() }, { budgetMs: 60_000 })))
    }
    const targets = await targetRows()
    const published = await publishedOnFake('ig-1')
    expect(new Set(published.map(p => p.caption)).size).toBe(published.length) // no caption went out twice
    expect(targets.filter(t => t.status === 'published')).toHaveLength(50)
    expect(published).toHaveLength(50)
  }, 120_000)
})
