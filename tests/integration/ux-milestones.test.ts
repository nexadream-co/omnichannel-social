import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { creatorProfile, onboardingSteps, resolveCreatorAccess } from '../../server/core/access'
import { closeDb, getDb } from '../../server/core/db/client'
import { bioPages, dmRules, linkClicks, links, plans, postTargets, posts, shortLinks, subscriptions, users, workspaces } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { recordMilestone } from '../../server/core/milestones'
import { provisionWorkspace } from '../../server/core/registration'
import { connectAccounts } from '../../server/core/social-accounts'
import { SEED_PLANS } from '../../shared/utils/plans'
import { addDays, weekStart } from '../../shared/utils/planner'
import { todayKey } from '../../server/core/timezone'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
let userId: string

const fakeAccount = (externalId: string) => ({ externalId, username: 'rina', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} })

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('link_clicks', 'short_links', 'dm_rules', 'bio_pages', 'jobs', 'post_targets', 'post_media', 'posts', 'links', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  userId = user!.id
  const { workspaceId } = await provisionWorkspace(base, userId, { name: 'Rina', email: 'rina@x.id' })
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  ws = { ...base, workspaceId, userId, role: 'owner', impersonatorId: null }
})
afterAll(closeDb)

describe('recordMilestone', () => {
  it('keeps the first timestamp on a second call', async () => {
    const first = await recordMilestone(ws, 'firstClick')
    expect(first.recorded).toBe(true)
    const stamp = first.milestones.firstClick
    expect(stamp).toBeTruthy()
    await new Promise(resolve => setTimeout(resolve, 15))
    const second = await recordMilestone(ws, 'firstClick')
    expect(second.recorded).toBe(false)
    expect(second.milestones.firstClick).toBe(stamp)
  })

  it('keeps other moments when a new one is added', async () => {
    await recordMilestone(ws, 'firstClick')
    const next = await recordMilestone(ws, 'upgradePaid')
    expect(Object.keys(next.milestones).sort()).toEqual(['firstClick', 'upgradePaid'])
  })

  it('records once under a race', async () => {
    const results = await Promise.all([recordMilestone(ws, 'clicks100'), recordMilestone(ws, 'clicks100'), recordMilestone(ws, 'clicks100')])
    expect(results.filter(r => r.recorded)).toHaveLength(1)
  })

  it('rejects an unknown key with 422', async () => {
    await expect(recordMilestone(ws, 'nope')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('accepts a week target and rejects a malformed one', async () => {
    const monday = weekStart(todayKey())
    expect((await recordMilestone(ws, `weekTarget:${monday}`)).recorded).toBe(true)
    expect((await recordMilestone(ws, `weekTarget:${addDays(monday, -7)}`)).recorded).toBe(true)
    await expect(recordMilestone(ws, 'weekTarget:x')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('rejects week targets other than this or last week', async () => {
    const monday = weekStart(todayKey())
    await expect(recordMilestone(ws, `weekTarget:${addDays(monday, -14)}`)).rejects.toMatchObject({ statusCode: 422 })
    await expect(recordMilestone(ws, `weekTarget:${addDays(monday, 7)}`)).rejects.toMatchObject({ statusCode: 422 })
    await expect(recordMilestone(ws, `weekTarget:${addDays(monday, 1)}`)).rejects.toMatchObject({ statusCode: 422 })
  })

  it('requires the read ability', async () => {
    await expect(recordMilestone({ ...ws, role: 'nobody' as never }, 'firstClick')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('does not write while staff impersonate', async () => {
    const result = await recordMilestone({ ...ws, impersonatorId: 'staff-1' }, 'firstClick')
    expect(result.recorded).toBe(false)
    expect(result.milestones).toEqual({})
    const [row] = await getDb().select({ m: workspaces.milestones }).from(workspaces).where(eq(workspaces.id, ws.workspaceId))
    expect(row!.m).toEqual({})
  })
})

describe('creatorProfile', () => {
  it('exposes milestones and autoReplyAdded', async () => {
    const [account] = (await connectAccounts(ws, 'instagram', [fakeAccount('ig-1')])).connected
    const session = { userId, activeWorkspaceId: ws.workspaceId } as never
    const before = await creatorProfile(getDb(), await resolveCreatorAccess(getDb(), session), session)
    expect(before.milestones).toEqual({})
    expect(before.onboarding.autoReplyAdded).toBe(false)
    expect(before.onboarding.linkAdded).toBe(false)

    await getDb().insert(dmRules).values({ workspaceId: ws.workspaceId, socialAccountId: account!, name: 'mau', keywords: ['mau'], dmMessage: 'Halo' })
    await recordMilestone(ws, 'firstAutoDm')
    const after = await creatorProfile(getDb(), await resolveCreatorAccess(getDb(), session), session)
    expect(after.onboarding.autoReplyAdded).toBe(true)
    expect(Object.keys(after.milestones)).toEqual(['firstAutoDm'])
  })
})

describe('onboardingSteps autoReplyAdded without Instagram', () => {
  it('stays open with no accounts or an Instagram account, and counts as done for Threads-only workspaces', async () => {
    expect((await onboardingSteps(getDb(), ws.workspaceId)).autoReplyAdded).toBe(false)
    await connectAccounts(ws, 'threads', [fakeAccount('th-1')])
    expect((await onboardingSteps(getDb(), ws.workspaceId)).autoReplyAdded).toBe(true)
    await connectAccounts(ws, 'instagram', [fakeAccount('ig-1')])
    expect((await onboardingSteps(getDb(), ws.workspaceId)).autoReplyAdded).toBe(false)
  })
})

describe('migration 0012 backfill', () => {
  const file = readFileSync(new URL('../../server/core/db/migrations/0012_workspace_milestones.sql', import.meta.url), 'utf8')
  const backfill = file.split('--> statement-breakpoint')[1]!.trim()

  it('marks moments a workspace already passed and keeps existing values', async () => {
    const db = getDb()
    const [account] = (await connectAccounts(ws, 'instagram', [fakeAccount('ig-1')])).connected
    const [post] = await db.insert(posts).values({ workspaceId: ws.workspaceId, baseCaption: 'x', status: 'published' }).returning({ id: posts.id })
    await db.insert(postTargets).values({ workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: account!, platform: 'instagram', format: 'feed', status: 'published', publishedAt: new Date('2026-09-01T10:00:00Z') })
    await db.insert(bioPages).values({ workspaceId: ws.workspaceId, handle: 'rina', published: true })
    const [link] = await db.insert(links).values({ workspaceId: ws.workspaceId, destinationUrl: 'https://shopee.co.id/x' }).returning({ id: links.id })
    const [short] = await db.insert(shortLinks).values({ workspaceId: ws.workspaceId, slug: 'abc123', domain: 'localhost', linkId: link!.id }).returning({ id: shortLinks.id })
    await db.insert(linkClicks).values({ workspaceId: ws.workspaceId, shortLinkId: short!.id, clickedAt: new Date('2026-09-02T10:00:00Z') })
    await db.insert(dmRules).values({ workspaceId: ws.workspaceId, socialAccountId: account!, name: 'mau', keywords: ['mau'], dmMessage: 'Halo' })
    await db.update(workspaces).set({ milestones: { firstClick: '2020-01-01T00:00:00.000Z' } }).where(eq(workspaces.id, ws.workspaceId))

    await db.execute(sql.raw(backfill))

    const [row] = await db.select({ m: workspaces.milestones }).from(workspaces).where(eq(workspaces.id, ws.workspaceId))
    const m = row!.m
    expect(m.firstAccountConnected).toBeTruthy()
    expect(m.firstPostScheduled).toBeTruthy()
    expect(new Date(m.firstPostPublished!).toISOString()).toBe('2026-09-01T10:00:00.000Z')
    expect(m.firstClick).toBe('2020-01-01T00:00:00.000Z')
    expect(m.etalasePublished).toBeTruthy()
    expect(m.checklistComplete).toBeTruthy()
    expect(m.clicks100).toBeUndefined()
    expect(m.upgradePaid).toBeUndefined()
    expect(m.firstAutoDm).toBeUndefined()

    await db.insert(linkClicks).values(Array.from({ length: 99 }, () => ({ workspaceId: ws.workspaceId, shortLinkId: short!.id, clickedAt: new Date('2026-09-03T10:00:00Z') })))
    await db.execute(sql.raw(backfill))
    const [after] = await db.select({ m: workspaces.milestones }).from(workspaces).where(eq(workspaces.id, ws.workspaceId))
    expect(after!.m.clicks100).toBeTruthy()
    expect(after!.m.clicks1000).toBeUndefined()
  })
})
