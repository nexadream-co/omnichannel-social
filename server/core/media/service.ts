import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { z } from 'zod'
import { editedDurationMs, editSpecSchema, isNoopSpec, type EditSpec } from '../../../shared/media/edit-spec'
import { assertAbility, type CoreContext, type WorkspaceContext } from '../context'
import type { Database } from '../db/client'
import { bioPages, mediaAssets, postMedia, systemHeartbeat } from '../db/schema'
import { getEntitlements } from '../entitlements'
import { env } from '../env'
import { appError } from '../errors'
import { sniffImageType } from '../images'
import { enqueue } from '../jobs/enqueue'
import type { JobHandler } from '../jobs/types'
import { mediaProcessor } from '../services/media'
import { storage } from '../services/storage'
import type { ProcessRequest, ProcessResult } from './ffmpeg-args'
import { imageDimensions, jpegNeedsRotation } from './image-header'

export const MEDIA_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime'] as const
export const MEDIA_MAX_BYTES = 300 * 1024 * 1024
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov' }
const WATCHDOG_MS = 35 * 60_000
const INLINE_MAX_BYTES = 8 * 1024 * 1024
const INLINE_MAX_PX = 4096

/** Failure codes from the processor → a plain sentence for the creator (never a codec name). */
const FAILURE_COPY: Record<string, string> = {
  unreadable: 'File ini tidak bisa dibuka. Coba ekspor ulang dari galeri lalu unggah lagi.',
  too_long: 'Video terlalu panjang. Potong menjadi maksimal 20 menit lalu unggah lagi.',
  unsupported: 'Format file ini belum didukung. Pakai foto JPG/PNG atau video MP4/MOV.',
  failed: 'File gagal diproses. Coba unggah lagi.',
  timeout: 'File terlalu lama diproses. Coba unggah lagi.',
  source_gone: 'Video aslinya sudah dihapus, jadi hasil edit tidak bisa dibuat.'
}

type MediaRow = typeof mediaAssets.$inferSelect
interface Variants { main?: string, original?: string, poster?: string, overlay?: string, pendingKey?: string, posterKey?: string, resubmitted?: boolean, probe?: unknown }
const variantsOf = (row: Pick<MediaRow, 'variants'>) => row.variants as Variants

export function toMediaView(row: MediaRow) {
  const variants = variantsOf(row)
  return {
    id: row.id, kind: row.kind, mime: row.mime, bytes: row.bytes, width: row.width, height: row.height,
    durationMs: row.durationMs, status: row.status, url: row.publicUrl, error: row.error, createdAt: row.createdAt,
    posterUrl: variants.poster ? storage().publicUrl(variants.poster) : null,
    sourceMediaId: row.sourceMediaId,
    editSpec: row.editSpec ?? null,
    coverMs: row.editSpec?.coverMs ?? null
  }
}
export type MediaView = ReturnType<typeof toMediaView>

async function findMedia(ctx: WorkspaceContext, id: string) {
  const [row] = await ctx.db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.workspaceId, ctx.workspaceId))).limit(1)
  if (!row) throw appError(404, 'Media tidak ditemukan.', 'NOT_FOUND')
  return row
}

/** The source of an edit: same workspace (404 otherwise, never a hint that it exists elsewhere) and ready. */
async function editSource(ctx: WorkspaceContext, id: string, kind: 'image' | 'video') {
  const row = await findMedia(ctx, id)
  if (row.kind !== kind) throw appError(422, kind === 'video' ? 'Media ini bukan video.' : 'Media ini bukan foto.', 'VALIDATION_FAILED')
  if (row.status !== 'ready') throw appError(409, 'Media masih diproses. Tunggu sebentar lalu coba lagi.', 'CONFLICT')
  return row
}

function parseSpec(raw: unknown, kind: 'image' | 'video'): EditSpec {
  const parsed = editSpecSchema.safeParse(raw)
  if (!parsed.success || parsed.data.kind !== kind) {
    throw appError(422, parsed.success ? 'Pengaturan edit tidak cocok dengan jenis media.' : (parsed.error.issues[0]?.message ?? 'Pengaturan edit tidak valid.'), 'VALIDATION_FAILED')
  }
  return parsed.data
}

async function assertStorageRoom(ctx: WorkspaceContext, bytes: number) {
  const { limits } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  if (limits.mediaStorageMb === -1) return
  const [used] = await ctx.db.select({ bytes: sql<number>`coalesce(sum(${mediaAssets.bytes}), 0)::bigint` }).from(mediaAssets)
    .where(and(eq(mediaAssets.workspaceId, ctx.workspaceId), ne(mediaAssets.status, 'failed')))
  if (Number(used?.bytes ?? 0) + bytes > limits.mediaStorageMb * 1024 * 1024) {
    throw appError(402, 'Penyimpanan media sudah penuh. Hapus media lama atau upgrade paket.', 'LIMIT_REACHED', { limit: 'mediaStorageMb', max: limits.mediaStorageMb })
  }
}

const newKey = (ctx: WorkspaceContext, id: string, ext: string) => `w/${ctx.workspaceId}/${id}/${randomBytes(8).toString('hex')}.${ext}`

export const presignSchema = z.object({
  filename: z.string().max(255).default('upload'),
  mime: z.enum(MEDIA_MIMES, { error: 'Format file belum didukung. Pakai foto JPG/PNG/HEIC atau video MP4/MOV.' }),
  bytes: z.number().int().positive().max(MEDIA_MAX_BYTES, 'Ukuran file maksimal 300 MB.'),
  /** A photo the editor rendered in the browser: the untouched source and the recipe, for re-editing. */
  sourceMediaId: z.string().max(64).optional(),
  editSpec: z.unknown().optional()
})

/** POST /api/app/media/presign: a media_assets row + a 15-minute presigned PUT (docs/blueprint/16 §1.1). */
export async function presignMediaUpload(ctx: WorkspaceContext, input: z.infer<typeof presignSchema>) {
  assertAbility(ctx, 'media.manage')
  let edit: { sourceMediaId: string, editSpec: EditSpec } | null = null
  if (input.sourceMediaId) {
    if (!input.mime.startsWith('image/')) throw appError(422, 'Video hasil edit dibuat oleh server, bukan diunggah.', 'VALIDATION_FAILED')
    const source = await editSource(ctx, input.sourceMediaId, 'image')
    edit = { sourceMediaId: source.id, editSpec: parseSpec(input.editSpec, 'image') }
  }
  await assertStorageRoom(ctx, input.bytes)
  const id = uuidv7()
  const key = newKey(ctx, id, EXT[input.mime]!)
  await ctx.db.insert(mediaAssets).values({ id, workspaceId: ctx.workspaceId, r2Key: key, mime: input.mime, kind: input.mime.startsWith('video/') ? 'video' : 'image', bytes: input.bytes, status: 'uploading', ...edit })
  const upload = await storage().presignPut({ key, contentType: input.mime, contentLength: input.bytes, ttlSeconds: 15 * 60 })
  return { mediaId: id, uploadUrl: upload.url, uploadHeaders: upload.headers }
}

export const videoEditSchema = z.object({
  spec: z.unknown(),
  /** The browser drew text, stickers or a watermark: it uploads one transparent PNG before /complete. */
  hasOverlay: z.boolean().default(false)
})
const OVERLAY_MAX_BYTES = 4 * 1024 * 1024

/**
 * POST /api/app/media/:id/edits: a new video asset rendered by the media processor from `spec` (ARCHITECTURE §8.5).
 * With an overlay the row waits in `uploading` for the PNG and the usual /complete; otherwise it is queued now.
 */
export async function createVideoEdit(ctx: WorkspaceContext, sourceId: string, input: z.infer<typeof videoEditSchema>) {
  assertAbility(ctx, 'media.manage')
  const source = await editSource(ctx, sourceId, 'video')
  const spec = parseSpec(input.spec, 'video')
  const sourceMs = source.durationMs ?? 0
  if (spec.trim && (spec.trim.startMs >= sourceMs || editedDurationMs(spec, sourceMs) < 1000)) {
    throw appError(422, 'Bagian video yang dipilih terlalu pendek. Pilih minimal 1 detik.', 'VALIDATION_FAILED')
  }
  if (spec.coverMs !== undefined && spec.coverMs > editedDurationMs(spec, sourceMs)) {
    throw appError(422, 'Sampul harus diambil dari bagian video yang dipakai.', 'VALIDATION_FAILED')
  }
  if (isNoopSpec(spec, sourceMs) && !input.hasOverlay) throw appError(422, 'Belum ada yang diubah.', 'VALIDATION_FAILED')
  // Until the render reports its real size, reserve the source's bytes for the part of the video that is kept.
  const estimate = Math.max(1, Math.round(source.bytes * (sourceMs ? editedDurationMs(spec, sourceMs) / sourceMs : 1)))
  await assertStorageRoom(ctx, estimate)
  const id = uuidv7()
  const key = newKey(ctx, id, 'mp4')
  const overlayKey = input.hasOverlay ? `${key}.overlay.png` : undefined
  const jobId = await ctx.db.transaction(async (tx) => {
    await tx.insert(mediaAssets).values({
      id, workspaceId: ctx.workspaceId, r2Key: key, mime: 'video/mp4', kind: 'video', bytes: estimate,
      status: overlayKey ? 'uploading' : 'processing', sourceMediaId: source.id, editSpec: spec, variants: overlayKey ? { overlay: overlayKey } : {}
    })
    return overlayKey ? null : enqueue(tx, 'media.process', { mediaId: id, workspaceId: ctx.workspaceId }, { singletonKey: id })
  })
  const overlayUpload = overlayKey
    ? await storage().presignPut({ key: overlayKey, contentType: 'image/png', contentLength: OVERLAY_MAX_BYTES, ttlSeconds: 15 * 60 })
    : null
  return { mediaId: id, overlayUploadUrl: overlayUpload?.url ?? null, overlayUploadHeaders: overlayUpload?.headers ?? {}, jobId }
}

/** POST /api/app/media/:id/complete → enqueue media.process (kicked by the handler). Idempotent. */
export async function completeMediaUpload(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'media.manage')
  return ctx.db.transaction(async (tx) => {
    const rows = await tx.update(mediaAssets).set({ status: 'processing', updatedAt: new Date() })
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.workspaceId, ctx.workspaceId), eq(mediaAssets.status, 'uploading')))
      .returning({ id: mediaAssets.id })
    if (!rows.length) {
      const [row] = await tx.select({ status: mediaAssets.status }).from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.workspaceId, ctx.workspaceId)))
      if (!row) throw appError(404, 'Media tidak ditemukan.', 'NOT_FOUND')
      return { jobId: null, status: row.status }
    }
    return { jobId: await enqueue(tx, 'media.process', { mediaId: id, workspaceId: ctx.workspaceId }, { singletonKey: id }), status: 'processing' as const }
  })
}

export async function getMedia(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'posts.read')
  return toMediaView(await findMedia(ctx, id))
}

export interface MediaListQuery { page: number, limit: number, offset: number, kind?: 'image' | 'video' | null, readyOnly?: boolean }

/** Galeri Media: newest first, never half-uploaded or failed files, plus the storage used. */
export async function listMedia(ctx: WorkspaceContext, query: MediaListQuery) {
  assertAbility(ctx, 'posts.read')
  const where = and(
    eq(mediaAssets.workspaceId, ctx.workspaceId),
    query.readyOnly ? eq(mediaAssets.status, 'ready') : inArray(mediaAssets.status, ['processing', 'ready']),
    query.kind ? eq(mediaAssets.kind, query.kind) : undefined
  )
  const [items, [total], [used], { limits }] = await Promise.all([
    ctx.db.select().from(mediaAssets).where(where).orderBy(desc(mediaAssets.createdAt)).limit(query.limit).offset(query.offset),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(mediaAssets).where(where),
    ctx.db.select({ bytes: sql<string>`coalesce(sum(${mediaAssets.bytes}), 0)` }).from(mediaAssets)
      .where(and(eq(mediaAssets.workspaceId, ctx.workspaceId), ne(mediaAssets.status, 'failed'))),
    getEntitlements(ctx.workspaceId, undefined, ctx.db)
  ])
  const n = total?.n ?? 0
  return {
    items: items.map(toMediaView),
    meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) },
    storage: { usedBytes: Number(used?.bytes ?? 0), limitMb: limits.mediaStorageMb }
  }
}

/**
 * DELETE /api/app/media/:id. Media still attached to a post or an Etalase photo stays (the creator removes it there
 * first). The row goes now; its files are removed by media.purge.
 */
export async function deleteMedia(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'media.manage')
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.workspaceId, ctx.workspaceId))).for('update').limit(1)
    if (!row) throw appError(404, 'Media tidak ditemukan.', 'NOT_FOUND')
    if (row.status === 'processing') throw appError(409, 'Media masih diproses. Tunggu sampai selesai, lalu hapus.', 'CONFLICT')
    const [usedInPost] = await tx.select({ postId: postMedia.postId }).from(postMedia).where(and(eq(postMedia.workspaceId, ctx.workspaceId), eq(postMedia.mediaId, id))).limit(1)
    if (usedInPost) throw appError(409, 'Media ini dipakai di postingan. Hapus dulu dari postingan, lalu coba lagi.', 'CONFLICT', { reason: 'in_post' })
    const [usedInBio] = await tx.select({ id: bioPages.id }).from(bioPages).where(and(eq(bioPages.workspaceId, ctx.workspaceId), eq(bioPages.avatarMediaId, id))).limit(1)
    if (usedInBio) throw appError(409, 'Media ini dipakai sebagai foto Etalase. Ganti fotonya dulu, lalu coba lagi.', 'CONFLICT', { reason: 'in_bio' })
    await tx.delete(mediaAssets).where(eq(mediaAssets.id, id))
    const variants = variantsOf(row)
    const keys = [...new Set([row.r2Key, variants.main, variants.original, variants.poster, variants.overlay, variants.pendingKey, variants.posterKey].filter((k): k is string => typeof k === 'string'))]
    const jobId = await enqueue(tx, 'media.purge', { workspaceId: ctx.workspaceId, mediaId: id, keys })
    return { deleted: true, jobId }
  })
}

/** media.purge: removes a deleted asset's files. Deleting a missing object is a no-op, so retries are safe. */
export const purgeMediaJob: JobHandler = async (job) => {
  const keys = Array.isArray(job.payload.keys) ? job.payload.keys.filter((k): k is string => typeof k === 'string') : []
  for (const key of keys) await storage().delete(key)
}

async function readHead(key: string): Promise<Uint8Array> {
  const url = await storage().presignGet({ key, ttlSeconds: 300 })
  const response = await fetch(url, { headers: { range: 'bytes=0-65535' }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok && response.status !== 206) throw new Error(`Could not read uploaded file (${response.status})`)
  return new Uint8Array(await response.arrayBuffer()).slice(0, 65_536)
}

async function failAsset(db: Database, row: MediaRow, code: keyof typeof FAILURE_COPY) {
  await db.update(mediaAssets).set({ status: 'failed', error: FAILURE_COPY[code], updatedAt: new Date() })
    .where(and(eq(mediaAssets.id, row.id), eq(mediaAssets.status, 'processing')))
}

/**
 * Sends the asset to the media processor. Uploaded videos and odd images are normalised from their own file; an
 * edited video is rendered from its source's processed MP4 with the spec. Videos also get a poster still.
 */
async function submit(db: Database, row: MediaRow) {
  const ref = uuidv7()
  const isVideo = row.kind === 'video'
  const editing = isVideo && row.editSpec
  let sourceKey = row.r2Key
  if (editing) {
    const [source] = row.sourceMediaId ? await db.select().from(mediaAssets).where(eq(mediaAssets.id, row.sourceMediaId)).limit(1) : []
    if (!source || source.status !== 'ready') return failAsset(db, row, 'source_gone')
    sourceKey = variantsOf(source).main ?? source.r2Key
  }
  const outKey = editing ? row.r2Key : `${row.r2Key}.processed.${isVideo ? 'mp4' : 'jpg'}`
  const posterKey = isVideo ? `${outKey}.poster.jpg` : undefined
  const contentType = isVideo ? 'video/mp4' : 'image/jpeg'
  const overlay = variantsOf(row).overlay
  await db.update(mediaAssets).set({ processorRef: ref, processorSubmittedAt: new Date(), variants: { ...variantsOf(row), pendingKey: outKey, posterKey }, updatedAt: new Date() }).where(eq(mediaAssets.id, row.id))
  const output = async (variant: string, key: string, type: string) => {
    const put = await storage().presignPut({ key, contentType: type, contentLength: 0, ttlSeconds: 3600 })
    return { variant, putUrl: put.url, putHeaders: put.headers, contentType: type }
  }
  const outputs: ProcessRequest['outputs'] = [await output('main', outKey, contentType)]
  if (posterKey) outputs.push(await output('poster', posterKey, 'image/jpeg'))
  await mediaProcessor().submit({
    assetId: row.id, ref, kind: row.kind,
    sourceUrl: await storage().presignGet({ key: sourceKey, ttlSeconds: 3600 }),
    callbackUrl: `${env().siteUrl}/api/internal/media/callback`,
    outputs,
    ...(editing
      ? { edit: { spec: row.editSpec!, overlayUrl: overlay ? await storage().presignGet({ key: overlay, ttlSeconds: 3600 }) : null } }
      : {})
  })
  await enqueue(db, 'media.watchdog', { mediaId: row.id, workspaceId: row.workspaceId, ref }, { runAt: new Date(Date.now() + WATCHDOG_MS), singletonKey: ref })
}

/**
 * media.process (ARCHITECTURE §8.5): an upright JPEG/PNG within limits is ready inline (photos the editor rendered
 * land here too); everything else (HEIC, WebP, sideways photos, every video) goes to the media processor container.
 */
export const processMediaJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, String(job.payload.mediaId))).limit(1)
  if (!row || row.status !== 'processing' || row.processorRef) return
  if (row.kind === 'image') {
    const head = await readHead(row.r2Key)
    const sniffed = sniffImageType(head)
    const dims = imageDimensions(head)
    const upright = sniffed !== 'image/jpeg' || !jpegNeedsRotation(head)
    if ((sniffed === 'image/jpeg' || sniffed === 'image/png') && dims && upright && row.bytes <= INLINE_MAX_BYTES && Math.max(dims.width, dims.height) <= INLINE_MAX_PX) {
      await db.update(mediaAssets).set({ status: 'ready', mime: sniffed, width: dims.width, height: dims.height, publicUrl: storage().publicUrl(row.r2Key), updatedAt: new Date() })
        .where(and(eq(mediaAssets.id, row.id), eq(mediaAssets.status, 'processing')))
      return
    }
  }
  await submit(db, row)
}

/** The signed callback from the processor. Applies the result only if the submission still matches. */
export async function applyMediaResult(ctx: Pick<CoreContext, 'db' | 'log'>, result: ProcessResult) {
  const db = ctx.db as Database
  await db.insert(systemHeartbeat).values({ name: 'media_processor', beatAt: new Date(), info: { assetId: result.assetId, status: result.status } })
    .onConflictDoUpdate({ target: systemHeartbeat.name, set: { beatAt: new Date(), info: { assetId: result.assetId, status: result.status } } })
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, result.assetId)).limit(1)
  if (!row) return { applied: false }
  const match = and(eq(mediaAssets.id, row.id), eq(mediaAssets.status, 'processing'), eq(mediaAssets.processorRef, result.ref))
  const main = result.outputs?.find(o => o.variant === 'main') ?? result.outputs?.[0]
  if (result.status === 'failed' || !main) {
    const rows = await db.update(mediaAssets).set({ status: 'failed', error: FAILURE_COPY[result.error?.code ?? 'failed'] ?? FAILURE_COPY.failed, updatedAt: new Date() }).where(match).returning({ id: mediaAssets.id })
    return { applied: rows.length > 0 }
  }
  const variants = variantsOf(row)
  const key = String(variants.pendingKey)
  const poster = result.outputs?.find(o => o.variant === 'poster')
  const rows = await db.update(mediaAssets).set({
    status: 'ready',
    mime: row.kind === 'video' ? 'video/mp4' : 'image/jpeg',
    width: main.width, height: main.height, durationMs: row.kind === 'video' ? main.durationMs : null, codec: main.codec,
    bytes: main.bytes + (poster?.bytes ?? 0),
    publicUrl: storage().publicUrl(key),
    variants: {
      main: key, original: row.r2Key, probe: result.probe ?? null,
      ...(poster && variants.posterKey ? { poster: variants.posterKey } : {}),
      ...(variants.overlay ? { overlay: variants.overlay } : {})
    },
    error: null,
    updatedAt: new Date()
  }).where(match).returning({ id: mediaAssets.id })
  return { applied: rows.length > 0 }
}

/** A callback that never arrives: resubmit once, then fail with a plain reason. */
export const mediaWatchdogJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, String(job.payload.mediaId))).limit(1)
  if (!row || row.status !== 'processing' || row.processorRef !== job.payload.ref) return
  if (variantsOf(row).resubmitted) {
    await failAsset(db, row, 'timeout')
    return
  }
  ctx.log.warn('media.watchdog_resubmit', { mediaId: row.id })
  await submit(db, row)
  await db.update(mediaAssets).set({ variants: sql`${mediaAssets.variants} || '{"resubmitted": true}'::jsonb` }).where(eq(mediaAssets.id, row.id))
}
