import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { StaffContext, WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { contentIdeaMedia, contentIdeas, links, mediaAssets, plans, posts, shoppingMoments, subscriptions, users } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { deleteMedia } from '../../server/core/media/service'
import { archiveIdea, createIdea, getIdea, ideaPatchSchema, ideaSchema, listIdeas, prepareMoment, setRhythm, updateIdea } from '../../server/core/planner/ideas'
import { createMoment, listMoments, momentPatchSchema, momentSchema, updateMoment } from '../../server/core/planner/moments'
import { calendarWindow, createPost, deletePost, getPost, reschedulePost } from '../../server/core/publishing/service'
import { provisionWorkspace } from '../../server/core/registration'
import { connectAccounts } from '../../server/core/social-accounts'
import { todayKey } from '../../server/core/timezone'
import { addDays } from '../../shared/utils/planner'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
let other: WorkspaceContext
let igId: string

const page = { page: 1, limit: 25, offset: 0, search: '' }
const fakeAccount = (externalId: string) => ({ externalId, username: 'rina', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} })

async function owner(email: string): Promise<WorkspaceContext> {
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email, emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email })
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  return { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
}

function staff(permissions: string[]): StaffContext {
  return { ...testContext(), staffUserId: 's', staffName: 'S', permissions: new Set(permissions), isSuperAdmin: false, impersonatorId: null }
}

async function image(ctx: WorkspaceContext) {
  const [row] = await getDb().insert(mediaAssets).values({ workspaceId: ctx.workspaceId, r2Key: `k/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', kind: 'image', bytes: 1000, width: 1080, height: 1350, status: 'ready', publicUrl: 'https://media.test/a.jpg' }).returning()
  return row!.id
}

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('content_idea_links', 'content_idea_media', 'content_ideas', 'jobs', 'post_targets', 'post_media', 'posts', 'media_assets', 'links', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  await getDb().delete(shoppingMoments).where(eq(shoppingMoments.name, 'Tes momen'))
  ws = await owner('rina@x.id')
  other = await owner('budi@x.id')
  ;[igId] = (await connectAccounts(ws, 'instagram', [fakeAccount('ig-1')])).connected
})
afterAll(closeDb)

describe('Bank Ide', () => {
  it('captures an idea with products and media, inside the workspace only', async () => {
    const mediaId = await image(ws)
    const [link] = await getDb().insert(links).values({ workspaceId: ws.workspaceId, destinationUrl: 'https://shopee.co.id/x', merchant: 'shopee', title: 'Sunscreen' }).returning()
    const idea = await createIdea(ws, ideaSchema.parse({ title: '  Review sunscreen 3 hari  ', note: '', linkIds: [link!.id, link!.id], mediaIds: [mediaId] }))
    expect(idea).toMatchObject({ title: 'Review sunscreen 3 hari', note: null, status: 'open', plannedOn: null })
    expect(idea.links.map(l => l.title)).toEqual(['Sunscreen'])
    expect(idea.media.map(m => m.id)).toEqual([mediaId])

    await expect(getIdea(other, idea.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(createIdea(other, ideaSchema.parse({ title: 'x', mediaIds: [mediaId] }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(createIdea({ ...ws, role: 'viewer' }, ideaSchema.parse({ title: 'x' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(() => ideaSchema.parse({ title: '   ' })).toThrow()
  })

  it('moves between the views: unplanned, planned, archived, restored', async () => {
    const idea = await createIdea(ws, ideaSchema.parse({ title: 'Unboxing paket' }))
    expect((await listIdeas(ws, { ...page, view: 'unplanned' })).items.map(i => i.id)).toEqual([idea.id])
    await updateIdea(ws, idea.id, ideaPatchSchema.parse({ plannedOn: '2030-01-02', pillar: 'review' }))
    expect((await listIdeas(ws, { ...page, view: 'planned' })).items[0]).toMatchObject({ plannedOn: '2030-01-02', pillar: 'review', title: 'Unboxing paket' })
    await archiveIdea(ws, idea.id)
    expect((await listIdeas(ws, { ...page, view: 'archived' })).meta.total).toBe(1)
    await updateIdea(ws, idea.id, ideaPatchSchema.parse({ status: 'open' }))
    expect((await listIdeas(ws, { ...page, view: 'planned' })).meta.total).toBe(1)
    expect((await listIdeas(other, { ...page, view: 'planned' })).meta.total).toBe(0)
  })

  it('drops a deleted Galeri photo from the idea instead of blocking the delete', async () => {
    const mediaId = await image(ws)
    const idea = await createIdea(ws, ideaSchema.parse({ title: 'Foto produk', mediaIds: [mediaId] }))
    await deleteMedia(ws, mediaId)
    expect(await getDb().select().from(contentIdeaMedia)).toHaveLength(0)
    expect((await getIdea(ws, idea.id)).media).toEqual([])
  })
})

describe('idea → post', () => {
  it('marks the idea used when it becomes a post, and gives it back when the post is deleted', async () => {
    const idea = await createIdea(ws, ideaSchema.parse({ title: 'Review jujur', plannedOn: '2030-01-02', pillar: 'review' }))
    const { postId } = await createPost(ws, { caption: 'Review jujur', mediaIds: [], targets: [{ socialAccountId: igId }], mode: 'draft', pillar: 'review', ideaId: idea.id })
    expect(await getIdea(ws, idea.id)).toMatchObject({ status: 'used', postId })
    const detail = await getPost(ws, postId)
    expect(detail).toMatchObject({ pillar: 'review', idea: { id: idea.id, title: 'Review jujur' } })
    await expect(updateIdea(ws, idea.id, ideaPatchSchema.parse({ title: 'x' }))).rejects.toMatchObject({ statusCode: 409 })

    // Another workspace can't consume this idea.
    const [otherIg] = (await connectAccounts(other, 'instagram', [fakeAccount('ig-2')])).connected
    const second = await createIdea(ws, ideaSchema.parse({ title: 'Kedua' }))
    await createPost(other, { caption: 'x', mediaIds: [], targets: [{ socialAccountId: otherIg! }], mode: 'draft', ideaId: second.id })
    expect((await getIdea(ws, second.id)).status).toBe('open')

    await deletePost(ws, postId)
    expect(await getIdea(ws, idea.id)).toMatchObject({ status: 'open', postId: null, plannedOn: '2030-01-02' })
  })

  it('keeps the pillar when the calendar drags a post', async () => {
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const { postId } = await createPost(ws, { caption: 'Edukasi', mediaIds: [], targets: [{ socialAccountId: igId }], mode: 'draft', scheduledAt: at, pillar: 'edukasi' })
    await reschedulePost(ws, postId, new Date(Date.now() + 4 * 86_400_000).toISOString())
    const [row] = await getDb().select().from(posts).where(eq(posts.id, postId))
    expect(row!.pillar).toBe('edukasi')
  })
})

describe('Kalender planner', () => {
  it('returns planned ideas on local days, moments in the window and the weekly target', async () => {
    const [moment] = await getDb().insert(shoppingMoments).values({ name: 'Tes momen', kind: 'twin_date', startsOn: '2030-01-05', endsOn: '2030-01-05' }).returning()
    await createIdea(ws, ideaSchema.parse({ title: 'Di dalam', plannedOn: '2030-01-01' }))
    await createIdea(ws, ideaSchema.parse({ title: 'Hari terakhir', plannedOn: '2030-01-07' }))
    await createIdea(ws, ideaSchema.parse({ title: 'Di luar', plannedOn: '2030-01-08' }))
    // 2030-01-01 00:00 WIB = 2029-12-31 17:00 UTC.
    const window = await calendarWindow(ws, new Date('2029-12-31T17:00:00Z'), new Date('2030-01-07T17:00:00Z'))
    expect(window.ideas.map(i => i.title)).toEqual(['Di dalam', 'Hari terakhir'])
    expect(window.moments.find(m => m.id === moment!.id)).toMatchObject({ name: 'Tes momen', prepared: false })
    expect(window.postsPerWeek).toBe(3)
    await setRhythm(ws, { postsPerWeek: 5 })
    expect((await calendarWindow(ws, new Date('2029-12-31T17:00:00Z'), new Date('2030-01-07T17:00:00Z'))).postsPerWeek).toBe(5)
  })

  it('prepares three dated ideas for a moment, once', async () => {
    const today = todayKey('Asia/Jakarta')
    const [moment] = await getDb().insert(shoppingMoments).values({ name: 'Tes momen', kind: 'twin_date', startsOn: addDays(today, 10), endsOn: addDays(today, 10), prepDays: 3 }).returning()
    const { items } = await prepareMoment(ws, moment!.id, { locale: 'id' })
    expect(items.map(i => i.plannedOn).sort()).toEqual([addDays(today, 7), addDays(today, 9), addDays(today, 10)])
    const rows = await getDb().select().from(contentIdeas).where(eq(contentIdeas.workspaceId, ws.workspaceId))
    expect(rows.every(r => r.momentId === moment!.id && r.title.includes('Tes momen'))).toBe(true)
    await expect(prepareMoment(ws, moment!.id, { locale: 'id' })).rejects.toMatchObject({ statusCode: 409 })
    // Archiving them allows preparing again; another workspace is independent.
    for (const row of rows) await archiveIdea(ws, row.id)
    await expect(prepareMoment(ws, moment!.id, { locale: 'en' })).resolves.toMatchObject({ items: expect.any(Array) })
    await expect(prepareMoment(other, moment!.id, { locale: 'id' })).resolves.toBeTruthy()
  })

  it('refuses a moment that is over or switched off', async () => {
    const today = todayKey('Asia/Jakarta')
    const [past] = await getDb().insert(shoppingMoments).values({ name: 'Tes momen', kind: 'payday', startsOn: addDays(today, -9), endsOn: addDays(today, -2) }).returning()
    await expect(prepareMoment(ws, past!.id, { locale: 'id' })).rejects.toMatchObject({ statusCode: 409 })
    const [off] = await getDb().insert(shoppingMoments).values({ name: 'Tes momen', kind: 'payday', startsOn: addDays(today, 5), endsOn: addDays(today, 5), isActive: false }).returning()
    await expect(prepareMoment(ws, off!.id, { locale: 'id' })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('admin moments', () => {
  it('ships the seeded moments and lets staff with the permission add and fix them', async () => {
    const admin = staff(['moments.read', 'moments.write'])
    const all = await listMoments(admin, { page: 1, limit: 100, search: 'harbolnas', when: 'all' })
    expect(all.items.map(m => m.id)).toEqual(expect.arrayContaining(['moment-1212-2026', 'moment-1212-2027']))

    await expect(createMoment(staff(['moments.read']), momentSchema.parse({ name: 'Tes momen', kind: 'campaign', startsOn: '2030-02-01', endsOn: '2030-02-03' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(() => momentSchema.parse({ name: 'Tes momen', kind: 'campaign', startsOn: '2030-02-03', endsOn: '2030-02-01' })).toThrow()
    const { id } = await createMoment(admin, momentSchema.parse({ name: 'Tes momen', kind: 'campaign', startsOn: '2030-02-01', endsOn: '2030-02-03' }))
    await expect(updateMoment(admin, id, momentPatchSchema.parse({ endsOn: '2030-01-01' }))).rejects.toMatchObject({ statusCode: 400 })
    await updateMoment(admin, id, momentPatchSchema.parse({ isActive: false }))
    const [row] = await getDb().select().from(shoppingMoments).where(eq(shoppingMoments.id, id))
    expect(row).toMatchObject({ isActive: false, startsOn: '2030-02-01', prepDays: 3 })
  })
})
