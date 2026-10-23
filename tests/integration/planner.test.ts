import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { StaffContext, WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { contentIdeaLinks, contentIdeaMedia, contentIdeas, dmRules, links, mediaAssets, notifications, plans, postMedia, posts, shoppingMoments, shortLinks, subscriptions, users, workspaces } from '../../server/core/db/schema'
import { autoReplyHint } from '../../server/core/autoreply/rules'
import type { ClaimedJob } from '../../server/core/jobs'
import { shortUrl } from '../../server/core/links/service'
import { plannerRemindersJob, plannerWeeklyJob } from '../../server/core/planner/jobs'
import { createIdeasFromMedia, fromMediaSchema, ideaFromPost, weekSummary } from '../../server/core/planner/shortcuts'
import { resetEnvCache } from '../../server/core/env'
import { deleteMedia } from '../../server/core/media/service'
import { archiveIdea, createIdea, getIdea, ideaPatchSchema, ideaSchema, listIdeas, prepareMoment, setRhythm, updateIdea } from '../../server/core/planner/ideas'
import { createMoment, listMoments, momentPatchSchema, momentSchema, updateMoment } from '../../server/core/planner/moments'
import { calendarWindow, createPost, deletePost, getPost, reschedulePost } from '../../server/core/publishing/service'
import { provisionWorkspace } from '../../server/core/registration'
import { connectAccounts } from '../../server/core/social-accounts'
import { todayKey } from '../../server/core/timezone'
import { addDays, weekStart } from '../../shared/utils/planner'
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
  await truncate('notifications', 'dm_rules', 'short_links', 'content_idea_links', 'content_idea_media', 'content_ideas', 'jobs', 'post_targets', 'post_media', 'posts', 'media_assets', 'links', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
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

const job = (payload: Record<string, unknown> = {}) => ({ id: 'j', queue: 'x', payload, workspaceId: null, attempts: 1, maxAttempts: 2, runAt: new Date() }) as ClaimedJob
const notificationsOf = async (ctx: WorkspaceContext) => getDb().select().from(notifications).where(eq(notifications.workspaceId, ctx.workspaceId))

/** A saved product with its vault short link, as Link Produk leaves it. */
async function product(ctx: WorkspaceContext, slug: string, title = 'Sunscreen') {
  const [link] = await getDb().insert(links).values({ workspaceId: ctx.workspaceId, destinationUrl: `https://shopee.co.id/${slug}`, merchant: 'shopee', title }).returning()
  await getDb().insert(shortLinks).values({ workspaceId: ctx.workspaceId, slug, domain: 'x', linkId: link!.id, source: 'vault' })
  return { id: link!.id, url: shortUrl(slug) }
}

describe('planner reminders (bell)', () => {
  it('nudges active workspaces whose next week is under target, once', async () => {
    const tz = 'Asia/Jakarta'
    const monday = weekStart(addDays(todayKey(tz), 7))
    await createPost(ws, { caption: 'Draf minggu depan', mediaIds: [], targets: [{ socialAccountId: igId }], mode: 'draft', scheduledAt: `${monday}T19:00:00+07:00` })
    const full = await owner('sari@x.id')
    await setRhythm(full, { postsPerWeek: 1 })
    await createIdea(full, ideaSchema.parse({ title: 'Sudah cukup', plannedOn: addDays(monday, 2) }))
    // `other` never posted or planned: dormant, left to the win-back email.
    await plannerWeeklyJob(job({ slot: new Date(Date.now() - 5 * 3_600_000).toISOString() }), testContext()) // a catch-up: skipped
    expect(await notificationsOf(ws)).toHaveLength(0)
    const slot = new Date().toISOString()
    await plannerWeeklyJob(job({ slot }), testContext())
    await plannerWeeklyJob(job({ slot }), testContext())
    const mine = await notificationsOf(ws)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ title: 'Minggu depan baru 1 dari 3 postingan', actionUrl: `/app/calendar?day=${monday}` })
    expect(await notificationsOf(full)).toHaveLength(0)
    expect(await notificationsOf(other)).toHaveLength(0)
  })

  it('reminds about ideas planned for tomorrow on each workspace clock', async () => {
    await getDb().update(workspaces).set({ timezone: 'Asia/Jayapura' }).where(eq(workspaces.id, other.workspaceId))
    const tomorrowWib = addDays(todayKey('Asia/Jakarta'), 1)
    const tomorrowWit = addDays(todayKey('Asia/Jayapura'), 1)
    await createIdea(ws, ideaSchema.parse({ title: 'Review jujur', plannedOn: tomorrowWib }))
    await createIdea(ws, ideaSchema.parse({ title: 'Unboxing', plannedOn: tomorrowWib }))
    await createIdea(ws, ideaSchema.parse({ title: 'Lusa', plannedOn: addDays(tomorrowWib, 1) }))
    await createIdea(other, ideaSchema.parse({ title: 'Tips hemat', plannedOn: tomorrowWit }))
    const slot = new Date().toISOString()
    await plannerRemindersJob(job({ slot }), testContext())
    await plannerRemindersJob(job({ slot }), testContext())
    const mine = await notificationsOf(ws)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ title: 'Besok: Review jujur (+1 ide lain)', actionUrl: `/app/calendar?day=${tomorrowWib}` })
    expect((await notificationsOf(other))[0]?.title).toBe('Besok: Tips hemat')
  })
})

describe('planner shortcuts', () => {
  it('turns Galeri media into ideas on the next empty days, or one carousel idea', async () => {
    const [a, b, c] = [await image(ws), await image(ws), await image(ws)]
    const tomorrow = addDays(todayKey('Asia/Jakarta'), 1)
    await createIdea(ws, ideaSchema.parse({ title: 'Sudah ada', plannedOn: tomorrow }))
    const { items } = await createIdeasFromMedia(ws, fromMediaSchema.parse({ mediaIds: [a, b, c] }))
    expect(items.map(i => i.plannedOn)).toEqual([addDays(tomorrow, 1), addDays(tomorrow, 2), addDays(tomorrow, 3)])
    const carousel = await createIdeasFromMedia(ws, fromMediaSchema.parse({ mediaIds: [a, b], mode: 'one', locale: 'en' }))
    expect(carousel.items).toEqual([expect.objectContaining({ plannedOn: null })])
    expect((await getIdea(ws, carousel.items[0]!.id))).toMatchObject({ title: 'Gallery carousel', media: [expect.objectContaining({ id: a }), expect.objectContaining({ id: b })] })
    await expect(createIdeasFromMedia(other, fromMediaSchema.parse({ mediaIds: [a] }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('makes an idea from a post: words without the product link, media, products and content type', async () => {
    const mediaId = await image(ws)
    const sunscreen = await product(ws, 'sun1')
    const { postId } = await createPost(ws, { caption: `Sunscreen favoritku!\nNggak lengket sama sekali.\n\n${sunscreen.url}`, mediaIds: [mediaId], targets: [{ socialAccountId: igId }], mode: 'draft', pillar: 'review' })
    const idea = await ideaFromPost(ws, postId, { locale: 'id' })
    expect(idea).toMatchObject({ title: 'Sunscreen favoritku!', note: 'Nggak lengket sama sekali.', pillar: 'review', plannedOn: null, status: 'open' })
    expect(idea.links.map(l => l.id)).toEqual([sunscreen.id])
    expect(idea.media.map(m => m.id)).toEqual([mediaId])
    expect(await getDb().select().from(postMedia).where(eq(postMedia.postId, postId))).toHaveLength(1) // the post is untouched
    await expect(ideaFromPost(other, postId, { locale: 'id' })).rejects.toMatchObject({ statusCode: 404 })
    expect(await getDb().select().from(contentIdeaLinks)).toHaveLength(1)
  })

  it('sums up this week for Beranda', async () => {
    const today = todayKey('Asia/Jakarta')
    await createIdea(ws, ideaSchema.parse({ title: 'Minggu ini', plannedOn: today }))
    await createIdea(ws, ideaSchema.parse({ title: 'Belum ada tanggal' }))
    const summary = await weekSummary(ws)
    expect(summary).toMatchObject({ weekStart: weekStart(today), count: 1, target: 3, unplannedIdeas: 1 })
  })

  it('suggests Balas Otomatis for an Instagram post with a product no rule sends yet', async () => {
    const sunscreen = await product(ws, 'sun2')
    const { postId } = await createPost(ws, { caption: `Cek ya ${sunscreen.url}`, mediaIds: [], targets: [{ socialAccountId: igId }], mode: 'draft' })
    expect(await autoReplyHint(ws, postId)).toEqual({ linkId: sunscreen.id, linkTitle: 'Sunscreen' })
    await getDb().insert(dmRules).values({ workspaceId: ws.workspaceId, socialAccountId: igId, name: 'Mau', dmMessage: 'Ini link: {link}', linkId: sunscreen.id })
    expect(await autoReplyHint(ws, postId)).toBeNull()
    const { postId: plain } = await createPost(ws, { caption: 'Tanpa produk', mediaIds: [], targets: [{ socialAccountId: igId }], mode: 'draft' })
    expect(await autoReplyHint(ws, plain)).toBeNull()
    await expect(autoReplyHint({ ...ws, role: 'viewer' }, postId)).rejects.toMatchObject({ statusCode: 403 })
  })
})
