import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { plans, posts, postTargets, subscriptions, users, workspaces } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { ideaSchema, createIdea, setRhythm } from '../../server/core/planner/ideas'
import { weekSummary } from '../../server/core/planner/shortcuts'
import { provisionWorkspace } from '../../server/core/registration'
import { connectAccounts } from '../../server/core/social-accounts'
import { startOfZonedDay, todayKey } from '../../server/core/timezone'
import { addDays, weekStart } from '../../shared/utils/planner'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
let igId: string
const TZ = 'Asia/Jakarta'

async function owner(email: string): Promise<WorkspaceContext> {
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email, emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email })
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  return { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
}

/** Puts `n` posts (one target each) at noon local time on `day`. */
async function postsOn(day: string, n: number, status: 'scheduled' | 'published' | 'cancelled' = 'scheduled') {
  const at = new Date(startOfZonedDay(day, TZ).getTime() + 12 * 3_600_000)
  for (let i = 0; i < n; i++) {
    const [post] = await getDb().insert(posts).values({ workspaceId: ws.workspaceId, status: 'scheduled', scheduledAt: at }).returning({ id: posts.id })
    await getDb().insert(postTargets).values({ workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: igId, platform: 'instagram', format: 'feed', status, scheduledAt: at })
  }
}

const monday = () => weekStart(todayKey(TZ))
const streak = async () => (await weekSummary(ws)).streak

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('notifications', 'short_links', 'content_idea_links', 'content_idea_media', 'content_ideas', 'jobs', 'post_targets', 'post_media', 'posts', 'media_assets', 'links', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  ws = await owner('rina@x.id')
  ;[igId] = (await connectAccounts(ws, 'instagram', [{ externalId: 'ig-1', username: 'rina', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])).connected
  await setRhythm(ws, { postsPerWeek: 2 })
})
afterAll(async () => {
  await getDb().update(workspaces).set({ postsPerWeek: 3 }).where(eq(workspaces.id, ws.workspaceId))
  await closeDb()
})

describe('week streak (contract C3)', () => {
  it('is 0 with nothing scheduled', async () => {
    expect(await streak()).toBe(0)
  })

  it('counts two past weeks that reached the target', async () => {
    await postsOn(addDays(monday(), -7), 2)
    await postsOn(addDays(monday(), -14), 3, 'published')
    expect(await streak()).toBe(2)
  })

  it('adds the current week once it reached the target', async () => {
    await postsOn(addDays(monday(), -7), 2)
    await postsOn(addDays(monday(), -14), 2)
    await postsOn(addDays(monday(), -21), 2)
    await postsOn(monday(), 1)
    expect(await streak()).toBe(3) // the current week is not there yet
    await createIdea(ws, ideaSchema.parse({ title: 'Cukup', plannedOn: monday() }))
    expect(await streak()).toBe(4)
  })

  it('stops at the first week that fell short', async () => {
    await postsOn(addDays(monday(), -7), 2)
    await postsOn(addDays(monday(), -14), 1)
    await postsOn(addDays(monday(), -21), 2)
    expect(await streak()).toBe(1)
  })

  it('ignores cancelled posts and counts one post with several targets once', async () => {
    await postsOn(addDays(monday(), -7), 2, 'cancelled')
    expect(await streak()).toBe(0)
    const at = new Date(startOfZonedDay(addDays(monday(), -14), TZ).getTime() + 3_600_000)
    const [post] = await getDb().insert(posts).values({ workspaceId: ws.workspaceId, status: 'scheduled', scheduledAt: at }).returning({ id: posts.id })
    for (const platform of ['instagram', 'threads'] as const) {
      await getDb().insert(postTargets).values({ workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: igId, platform, format: 'feed', status: 'scheduled', scheduledAt: at })
    }
    await postsOn(addDays(monday(), -7), 2)
    expect(await streak()).toBe(1) // week -1 reached; week -2 has one post, two targets
  })

  it('reads the week by the workspace local clock', async () => {
    // 23:30 local last Sunday is 16:30 UTC; by the UTC clock it is still the same week, by the local one it closes last week.
    const lastSunday = addDays(monday(), -1)
    const late = new Date(startOfZonedDay(lastSunday, TZ).getTime() + 23.5 * 3_600_000)
    for (const at of [late, new Date(startOfZonedDay(addDays(monday(), -6), TZ).getTime() + 3_600_000)]) {
      const [post] = await getDb().insert(posts).values({ workspaceId: ws.workspaceId, status: 'scheduled', scheduledAt: at }).returning({ id: posts.id })
      await getDb().insert(postTargets).values({ workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: igId, platform: 'instagram', format: 'feed', status: 'scheduled', scheduledAt: at })
    }
    expect(await streak()).toBe(1)
  })
})
