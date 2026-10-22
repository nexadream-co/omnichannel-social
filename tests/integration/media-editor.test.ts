import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { jobs, mediaAssets, plans, postMedia, posts, subscriptions, users } from '../../server/core/db/schema'
import { runDue } from '../../server/core/jobs'
import { applyMediaResult, createVideoEdit, deleteMedia, getMedia, listMedia, presignMediaUpload } from '../../server/core/media/service'
import { provisionWorkspace } from '../../server/core/registration'
import { fakeMediaProcessor } from '../../server/core/services/media/fake'
import { setMediaProcessor } from '../../server/core/services/media'
import { fakeStorageDriver } from '../../server/core/services/storage/fake'
import { setStorageDriver } from '../../server/core/services/storage'
import { defaultSpec } from '../../shared/media/edit-spec'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext
let other: WorkspaceContext
let videoId: string
let imageId: string
const processor = fakeMediaProcessor()
const files = fakeStorageDriver()

async function run() {
  await getDb().update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, 'queued'))
  await runDue({ ...testContext(), db: getDb() }, { budgetMs: 60_000 })
}

async function workspace(email: string): Promise<WorkspaceContext> {
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email, emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email })
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  return { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
}

const readyMedia = async (workspaceId: string, kind: 'image' | 'video') => {
  const key = `w/${workspaceId}/${kind}-${Math.random()}`
  const [row] = await getDb().insert(mediaAssets).values({
    workspaceId, r2Key: key, kind, mime: kind === 'video' ? 'video/mp4' : 'image/jpeg', bytes: 10_000_000, status: 'ready',
    width: 1920, height: 1080, durationMs: kind === 'video' ? 10_000 : null, publicUrl: `https://media.test/${key}`,
    variants: { main: `${key}.processed`, original: key }
  }).returning()
  return row!.id
}

beforeAll(async () => {
  setStorageDriver(files)
  setMediaProcessor(processor)
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  processor.submitted.length = 0
  await truncate('jobs', 'post_media', 'posts', 'media_assets', 'notifications', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'audit_logs')
  ctx = await workspace('rina@x.id')
  other = await workspace('budi@x.id')
  videoId = await readyMedia(ctx.workspaceId, 'video')
  imageId = await readyMedia(ctx.workspaceId, 'image')
})
afterAll(async () => {
  setStorageDriver(undefined)
  setMediaProcessor(undefined)
  await closeDb()
})

describe('media editor', () => {
  it('keeps an edited photo next to its source, with the recipe', async () => {
    const spec = { ...defaultSpec('image'), aspect: '4:5', crop: { x: 0.2, y: 0, w: 0.6, h: 1 } }
    const { mediaId } = await presignMediaUpload(ctx, { filename: 'edit.jpg', mime: 'image/jpeg', bytes: 50_000, sourceMediaId: imageId, editSpec: spec })
    const view = await getMedia(ctx, mediaId)
    expect(view.sourceMediaId).toBe(imageId)
    expect(view.editSpec).toMatchObject({ aspect: '4:5', crop: spec.crop })
  })

  it('never edits another workspace\'s media', async () => {
    await expect(presignMediaUpload(other, { filename: 'x.jpg', mime: 'image/jpeg', bytes: 1, sourceMediaId: imageId, editSpec: defaultSpec('image') }))
      .rejects.toMatchObject({ statusCode: 404 })
    await expect(createVideoEdit(other, videoId, { spec: { ...defaultSpec('video'), mute: true }, hasOverlay: false })).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteMedia(other, videoId)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('renders a video edit through the processor and keeps the poster and cover', async () => {
    const spec = { ...defaultSpec('video'), aspect: '9:16', fit: 'blur', trim: { startMs: 2000, endMs: 7000 }, coverMs: 1500, mute: true }
    const { mediaId, overlayUploadUrl } = await createVideoEdit(ctx, videoId, { spec, hasOverlay: false })
    expect(overlayUploadUrl).toBeNull()
    await run()
    const request = processor.submitted.at(-1)!
    expect(request.assetId).toBe(mediaId)
    expect(request.sourceUrl).toContain('.processed')
    expect(request.outputs.map(o => o.variant)).toEqual(['main', 'poster'])
    expect(request.edit?.spec).toMatchObject({ aspect: '9:16', fit: 'blur', coverMs: 1500 })
    const result = await applyMediaResult(testContext(), {
      assetId: mediaId, ref: request.ref, status: 'done',
      outputs: [
        { variant: 'main', bytes: 3_000_000, width: 1080, height: 1920, durationMs: 5000, codec: 'h264' },
        { variant: 'poster', bytes: 40_000, width: 720, height: 1280, durationMs: null, codec: 'mjpeg' }
      ]
    })
    expect(result.applied).toBe(true)
    const view = await getMedia(ctx, mediaId)
    expect(view).toMatchObject({ status: 'ready', width: 1080, height: 1920, durationMs: 5000, coverMs: 1500, sourceMediaId: videoId })
    expect(view.posterUrl).toMatch(/\.poster\.jpg$/)
  })

  it('waits for the overlay PNG before rendering', async () => {
    const { mediaId, overlayUploadUrl } = await createVideoEdit(ctx, videoId, { spec: defaultSpec('video'), hasOverlay: true })
    expect(overlayUploadUrl).toContain('.overlay.png')
    expect((await getMedia(ctx, mediaId)).status).toBe('uploading')
  })

  it('rejects edits that change nothing or cut the video to under a second', async () => {
    await expect(createVideoEdit(ctx, videoId, { spec: defaultSpec('video'), hasOverlay: false })).rejects.toMatchObject({ statusCode: 422 })
    await expect(createVideoEdit(ctx, videoId, { spec: { ...defaultSpec('video'), trim: { startMs: 9500, endMs: 12_000 } }, hasOverlay: false })).rejects.toMatchObject({ statusCode: 422 })
    await expect(createVideoEdit(ctx, imageId, { spec: { ...defaultSpec('video'), mute: true }, hasOverlay: false })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('counts the kept part of the video against storage', async () => {
    await getDb().update(mediaAssets).set({ bytes: 5_000 * 1024 * 1024 - 15_000_000 }).where(eq(mediaAssets.id, imageId)) // Kreator: 5,000 MB
    await expect(createVideoEdit(ctx, videoId, { spec: { ...defaultSpec('video'), mute: true }, hasOverlay: false })).rejects.toMatchObject({ statusCode: 402 })
    await expect(createVideoEdit(ctx, videoId, { spec: { ...defaultSpec('video'), trim: { startMs: 0, endMs: 5000 } }, hasOverlay: false })).resolves.toBeTruthy()
  })

  it('lists the gallery with storage used and filters by kind', async () => {
    const all = await listMedia(ctx, { page: 1, limit: 20, offset: 0 })
    expect(all.meta.total).toBe(2)
    expect(all.storage.usedBytes).toBe(20_000_000)
    expect((await listMedia(ctx, { page: 1, limit: 20, offset: 0, kind: 'video' })).items.map(i => i.id)).toEqual([videoId])
  })

  it('refuses to delete media a post uses, otherwise deletes and purges the files', async () => {
    const [post] = await getDb().insert(posts).values({ workspaceId: ctx.workspaceId }).returning()
    await getDb().insert(postMedia).values({ workspaceId: ctx.workspaceId, postId: post!.id, position: 0, mediaId: imageId })
    await expect(deleteMedia(ctx, imageId)).rejects.toMatchObject({ statusCode: 409 })

    const [row] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.id, videoId))
    files.objects.set(row!.r2Key, { body: new Uint8Array([1]), contentType: 'video/mp4' })
    files.objects.set(`${row!.r2Key}.processed`, { body: new Uint8Array([1]), contentType: 'video/mp4' })
    await deleteMedia(ctx, videoId)
    await run()
    expect(files.objects.has(row!.r2Key)).toBe(false)
    expect(files.objects.has(`${row!.r2Key}.processed`)).toBe(false)
    await expect(getMedia(ctx, videoId)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('fails an edit whose source was deleted before it rendered', async () => {
    const { mediaId } = await createVideoEdit(ctx, videoId, { spec: { ...defaultSpec('video'), mute: true }, hasOverlay: false })
    await deleteMedia(ctx, videoId)
    await run()
    expect(processor.submitted.find(r => r.assetId === mediaId)).toBeUndefined()
    expect(await getMedia(ctx, mediaId)).toMatchObject({ status: 'failed', sourceMediaId: null })
  })
})
