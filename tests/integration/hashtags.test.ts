import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { StaffContext, WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { hashtagLibrary, hashtagResearchRuns, hashtagSignals, insightSnapshots, jobs, plans, posts, postTargets, subscriptions, users } from '../../server/core/db/schema'
import { getEntitlements, invalidateEntitlements } from '../../server/core/entitlements'
import { resetEnvCache } from '../../server/core/env'
import { createLibraryTag, invalidateLibrary, libraryForComposer, libraryTagPatchSchema, libraryTagSchema, listLibrary, updateLibraryTag } from '../../server/core/hashtags/library'
import { tagPerformance } from '../../server/core/hashtags/performance'
import { getResearchRun, hashtagSignalsJob, researchTags } from '../../server/core/hashtags/research'
import { createHashtagSet, deleteHashtagSet, hashtagSetSchema, listHashtagSets, updateHashtagSet } from '../../server/core/hashtags/sets'
import type { ClaimedJob } from '../../server/core/jobs'
import { provisionWorkspace } from '../../server/core/registration'
import { setSetting } from '../../server/core/settings'
import { connectAccounts } from '../../server/core/social-accounts'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
const CAPTION = 'Sunscreen ringan buat kulit berminyak, nggak lengket dan nggak bikin jerawat. Cek link di bio!'

async function owner(email: string): Promise<WorkspaceContext> {
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email, emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email })
  return { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
}

async function plan(ctx: WorkspaceContext, slug: 'gratis' | 'kreator') {
  await getDb().update(subscriptions).set({ planId: `plan-${slug}`, status: slug === 'gratis' ? 'downgraded' : 'active' }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
  await invalidateEntitlements(ctx.workspaceId)
}

function staff(permissions: string[]): StaffContext {
  return { ...testContext(), staffUserId: 's', staffName: 'S', permissions: new Set(permissions), isSuperAdmin: false, impersonatorId: null }
}

const account = (externalId: string, scopes: string[] = []) => ({ externalId, username: 'rina', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes, meta: {} })

/** A published post with a views snapshot, as the nightly sync leaves it. */
async function publishedPost(ctx: WorkspaceContext, accountId: string, caption: string, views: number) {
  const [post] = await getDb().insert(posts).values({ workspaceId: ctx.workspaceId, baseCaption: caption, status: 'published' }).returning()
  const [target] = await getDb().insert(postTargets).values({
    workspaceId: ctx.workspaceId, postId: post!.id, socialAccountId: accountId, platform: 'instagram', format: 'feed', status: 'published', publishedAt: new Date()
  }).returning()
  await getDb().insert(insightSnapshots).values({ workspaceId: ctx.workspaceId, postTargetId: target!.id, metrics: { views } })
}

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  invalidateLibrary()
  await truncate('hashtag_research_runs', 'hashtag_sets', 'hashtag_signals', 'insight_snapshots', 'post_targets', 'posts', 'social_accounts', 'jobs', 'rate_limit_buckets', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  await setSetting('channels.hashtags.threadsSearchEnabled', 'false')
  ws = await owner('rina@x.id')
  await plan(ws, 'kreator')
})
afterAll(closeDb)

describe('tag list', () => {
  it('ships with the migration and reaches the composer', async () => {
    const { items } = await libraryForComposer(ws)
    expect(items.find(t => t.tag === 'sunscreen')).toMatchObject({ niche: 'skincare', breadth: 'specific', status: 'recommended' })
    expect(items.find(t => t.tag === 'f4f')?.status).toBe('blocked')
  })

  it('lets staff with the permission add and change tags, never delete them', async () => {
    await expect(createLibraryTag(staff(['hashtags.read']), libraryTagSchema.parse({ tag: 'x', niche: 'general' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(() => libraryTagSchema.parse({ tag: 'skin care', niche: 'skincare' })).toThrow()
    const admin = staff(['hashtags.read', 'hashtags.write'])
    const { id } = await createLibraryTag(admin, libraryTagSchema.parse({ tag: '#SerumMurah', niche: 'skincare', keywords: ['Serum', 'murah', 'serum'], breadth: 'specific' }))
    await expect(createLibraryTag(admin, libraryTagSchema.parse({ tag: 'serummurah', niche: 'skincare' }))).rejects.toMatchObject({ statusCode: 409 })
    await updateLibraryTag(admin, id, libraryTagPatchSchema.parse({ status: 'blocked' }))
    const [row] = await getDb().select().from(hashtagLibrary).where(eq(hashtagLibrary.id, id))
    expect(row).toMatchObject({ tag: 'serummurah', status: 'blocked', keywords: ['serum', 'murah'] }) // a partial update keeps the rest
    expect((await listLibrary(admin, { page: 1, limit: 25, search: 'serummurah' })).items).toHaveLength(1)
    await getDb().delete(hashtagLibrary).where(eq(hashtagLibrary.id, id))
  })
})

describe('saved tag sets', () => {
  it('cleans the tags and stays inside the workspace', async () => {
    const set = await createHashtagSet(ws, hashtagSetSchema.parse({ name: 'Skincare', tags: ['#sunscreen', 'Sunscreen', 'kulitberminyak'] }))
    expect(set.tags).toEqual(['sunscreen', 'kulitberminyak'])
    expect(() => hashtagSetSchema.parse({ name: 'x', tags: ['skin care'] })).toThrow()

    const other = await owner('budi@x.id')
    expect((await listHashtagSets(other)).items).toHaveLength(0)
    await expect(updateHashtagSet(other, set.id, { name: 'Curian' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteHashtagSet(other, set.id)).rejects.toMatchObject({ statusCode: 404 })

    await expect(createHashtagSet({ ...ws, role: 'viewer' }, { name: 'X', tags: ['a'] })).rejects.toMatchObject({ statusCode: 403 })
    await updateHashtagSet(ws, set.id, { name: 'Sunscreen' })
    expect((await listHashtagSets(ws)).items[0]).toMatchObject({ name: 'Sunscreen', tags: ['sunscreen', 'kulitberminyak'] })
    await deleteHashtagSet(ws, set.id)
    expect((await listHashtagSets(ws)).items).toHaveLength(0)
  })
})

describe('own results', () => {
  it('compares posts with a tag against the account usual views', async () => {
    const [igId] = (await connectAccounts(ws, 'instagram', [account('ig-perf')])).connected
    for (const views of [300, 320, 280]) await publishedPost(ws, igId!, 'Review sunscreen #sunscreen', views)
    for (const views of [100, 90, 110, 100]) await publishedPost(ws, igId!, 'Hari biasa #fyp', views)
    await publishedPost(ws, igId!, 'Sekali saja #jerawat', 500)
    const result = await tagPerformance(ws)
    expect(result.get('sunscreen')).toMatchObject({ posts: 3, label: 'better' })
    expect(result.get('fyp')).toMatchObject({ posts: 4, label: 'worse' })
    expect(result.get('jerawat')).toMatchObject({ posts: 1, ratio: null, label: 'notEnoughData' })
  })
})

describe('research', () => {
  it('is paid: 402 on Gratis, while the free tag list still works', async () => {
    await plan(ws, 'gratis')
    await expect(researchTags(ws, { caption: CAPTION, platforms: ['instagram'], extraTags: [] })).rejects.toMatchObject({ statusCode: 402, data: { code: 'PLAN_REQUIRED' } })
    expect((await libraryForComposer(ws)).items.length).toBeGreaterThan(50)
    await expect(researchTags({ ...ws, role: 'viewer' }, { caption: CAPTION, platforms: [], extraTags: [] })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('suggests fitting tags, flags the creator own input and counts one use per caption', async () => {
    const result = await researchTags(ws, { caption: `${CAPTION}\n\n#fyp`, platforms: ['instagram'], extraTags: ['powerbank', 'skin care'] })
    const byTag = new Map(result.items.map(item => [item.tag.toLowerCase(), item]))
    expect(byTag.get('sunscreen')).toMatchObject({ sources: ['list'], fit: 1, quality: { level: 'good' } })
    expect(byTag.get('fyp')).toMatchObject({ sources: ['mine'], quality: { codes: expect.arrayContaining(['generic']) } })
    expect(byTag.get('powerbank')?.quality.codes).toContain('unrelated')
    expect(byTag.get('skin care')?.quality.level).toBe('error')
    expect(result).toMatchObject({ status: 'ready', niche: 'skincare', threads: 'notSelected', usage: { used: 1, limit: 100 } })

    const again = await researchTags(ws, { caption: `${CAPTION}\n\n#fyp`, platforms: ['instagram'], extraTags: ['skin care', 'powerbank'] })
    expect(again.runId).toBe(result.runId)
    expect(await getDb().select().from(hashtagResearchRuns)).toHaveLength(1)
    expect((await getEntitlements(ws.workspaceId)).limits.tagResearchPerMonth).toBe(100)
  })

  it('stops at the monthly allowance', async () => {
    await getDb().update(plans).set({ limits: { ...SEED_PLANS[1]!.limits, tagResearchPerMonth: 1 } }).where(eq(plans.id, 'plan-kreator'))
    await invalidateEntitlements(ws.workspaceId)
    try {
      await researchTags(ws, { caption: 'Sunscreen pertama', platforms: [], extraTags: [] })
      await expect(researchTags(ws, { caption: 'Sunscreen kedua', platforms: [], extraTags: [] })).rejects.toMatchObject({ statusCode: 402, data: { code: 'LIMIT_REACHED' } })
    } finally {
      await getDb().update(plans).set({ limits: SEED_PLANS[1]!.limits }).where(eq(plans.id, 'plan-kreator'))
      await invalidateEntitlements(ws.workspaceId)
    }
  })

  it('brings in tags that did well before and fit the caption', async () => {
    const [igId] = (await connectAccounts(ws, 'instagram', [account('ig-hist')])).connected
    for (const views of [300, 320, 280]) await publishedPost(ws, igId!, 'Sunscreen favorit #sunscreenlokalku', views)
    for (const views of [100, 90, 110]) await publishedPost(ws, igId!, 'Powerbank #powerbankmurah', views)
    const { items } = await researchTags(ws, { caption: CAPTION, platforms: ['instagram'], extraTags: [] })
    expect(items.find(i => i.tag === 'sunscreenlokalku')).toMatchObject({ sources: ['history'], performance: { label: 'better' } })
    expect(items.find(i => i.tag === 'powerbankmurah')).toBeUndefined() // doesn't fit a skincare caption
  })

  it('explains why Threads numbers are missing', async () => {
    const ask = (caption: string) => researchTags(ws, { caption, platforms: ['instagram', 'threads'], extraTags: [] })
    expect((await ask(`${CAPTION} 1`)).threads).toBe('off')
    await setSetting('channels.hashtags.threadsSearchEnabled', 'true')
    expect((await ask(`${CAPTION} 2`)).threads).toBe('noAccount')
  })

  it('looks up Threads activity in a job, caches it for everyone and marks the run ready', async () => {
    await setSetting('channels.hashtags.threadsSearchEnabled', 'true')
    await connectAccounts(ws, 'threads', [account('th-1', ['fake'])])
    const run = await researchTags(ws, { caption: CAPTION, platforms: ['threads'], extraTags: [] })
    expect(run).toMatchObject({ status: 'pending', threads: 'pending' })
    const [queued] = await getDb().select().from(jobs).where(eq(jobs.queue, 'hashtags.signals'))
    expect(queued).toBeTruthy()

    await hashtagSignalsJob({ id: queued!.id, queue: queued!.queue, payload: queued!.payload, workspaceId: ws.workspaceId, attempts: 1, maxAttempts: 1, runAt: new Date() } as ClaimedJob, testContext())
    const done = await getResearchRun(ws, run.runId)
    expect(done).toMatchObject({ status: 'ready', threads: 'ready' })
    expect(done.items.filter(i => i.activity).length).toBeGreaterThan(0)
    const cached = await getDb().select().from(hashtagSignals)
    expect(cached.length).toBe(done.items.filter(i => i.activity).length)

    // Another workspace asking about the same tags uses the cache: ready at once, no job.
    const other = await owner('budi@x.id')
    await plan(other, 'kreator')
    await connectAccounts(other, 'threads', [account('th-2', ['fake'])])
    await getDb().delete(jobs)
    const second = await researchTags(other, { caption: CAPTION, platforms: ['threads'], extraTags: [] })
    expect(second).toMatchObject({ status: 'ready', threads: 'ready' })
    expect(await getDb().select().from(jobs)).toHaveLength(0)
    await expect(getResearchRun(other, run.runId)).rejects.toMatchObject({ statusCode: 404 })
  })
})
