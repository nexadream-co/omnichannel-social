import { randomBytes } from 'node:crypto'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { z } from 'zod'
import { assertAbility, type CoreContext, type WorkspaceContext } from '../context'
import type { Database } from '../db/client'
import { mediaAssets, systemHeartbeat } from '../db/schema'
import { getEntitlements } from '../entitlements'
import { env } from '../env'
import { appError } from '../errors'
import { sniffImageType } from '../images'
import { enqueue } from '../jobs/enqueue'
import type { JobHandler } from '../jobs/types'
import { mediaProcessor } from '../services/media'
import { storage } from '../services/storage'
import type { ProcessResult } from './ffmpeg-args'
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
  too_long: 'Video terlalu panjang. Potong menjadi maksimal 15 menit lalu unggah lagi.',
  unsupported: 'Format file ini belum didukung. Pakai foto JPG/PNG atau video MP4/MOV.',
  failed: 'File gagal diproses. Coba unggah lagi.',
  timeout: 'File terlalu lama diproses. Coba unggah lagi.'
}

export function toMediaView(row: typeof mediaAssets.$inferSelect) {
  return {
    id: row.id, kind: row.kind, mime: row.mime, bytes: row.bytes, width: row.width, height: row.height,
    durationMs: row.durationMs, status: row.status, url: row.publicUrl, error: row.error, createdAt: row.createdAt
  }
}

export const presignSchema = z.object({
  filename: z.string().max(255).default('upload'),
  mime: z.enum(MEDIA_MIMES, { error: 'Format file belum didukung. Pakai foto JPG/PNG/HEIC atau video MP4/MOV.' }),
  bytes: z.number().int().positive().max(MEDIA_MAX_BYTES, 'Ukuran file maksimal 300 MB.')
})

/** POST /api/app/media/presign: a media_assets row + a 15-minute presigned PUT (docs/blueprint/16 §1.1). */
export async function presignMediaUpload(ctx: WorkspaceContext, input: z.infer<typeof presignSchema>) {
  assertAbility(ctx, 'media.manage')
  const { limits } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  if (limits.mediaStorageMb !== -1) {
    const [used] = await ctx.db.select({ bytes: sql<number>`coalesce(sum(${mediaAssets.bytes}), 0)::bigint` }).from(mediaAssets)
      .where(and(eq(mediaAssets.workspaceId, ctx.workspaceId), ne(mediaAssets.status, 'failed')))
    if (Number(used?.bytes ?? 0) + input.bytes > limits.mediaStorageMb * 1024 * 1024) {
      throw appError(402, 'Penyimpanan media sudah penuh. Hapus media lama atau upgrade paket.', 'LIMIT_REACHED', { limit: 'mediaStorageMb', max: limits.mediaStorageMb })
    }
  }
  const id = uuidv7()
  const key = `w/${ctx.workspaceId}/${id}/${randomBytes(8).toString('hex')}.${EXT[input.mime]}`
  await ctx.db.insert(mediaAssets).values({ id, workspaceId: ctx.workspaceId, r2Key: key, mime: input.mime, kind: input.mime.startsWith('video/') ? 'video' : 'image', bytes: input.bytes, status: 'uploading' })
  const uploadUrl = await storage().presignPut({ key, contentType: input.mime, contentLength: input.bytes, ttlSeconds: 15 * 60 })
  return { mediaId: id, uploadUrl }
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
  const [row] = await ctx.db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.workspaceId, ctx.workspaceId))).limit(1)
  if (!row) throw appError(404, 'Media tidak ditemukan.', 'NOT_FOUND')
  return toMediaView(row)
}

export async function listMedia(ctx: WorkspaceContext, query: { page: number, limit: number, offset: number }) {
  assertAbility(ctx, 'posts.read')
  const where = and(eq(mediaAssets.workspaceId, ctx.workspaceId), ne(mediaAssets.status, 'uploading'))
  const [items, [total]] = await Promise.all([
    ctx.db.select().from(mediaAssets).where(where).orderBy(desc(mediaAssets.createdAt)).limit(query.limit).offset(query.offset),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(mediaAssets).where(where)
  ])
  const n = total?.n ?? 0
  return { items: items.map(toMediaView), meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) } }
}

async function readHead(key: string): Promise<Uint8Array> {
  const url = await storage().presignGet({ key, ttlSeconds: 300 })
  const response = await fetch(url, { headers: { range: 'bytes=0-65535' }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok && response.status !== 206) throw new Error(`Could not read uploaded file (${response.status})`)
  return new Uint8Array(await response.arrayBuffer()).slice(0, 65_536)
}

async function submit(db: Database, row: typeof mediaAssets.$inferSelect) {
  const ref = uuidv7()
  const isVideo = row.kind === 'video'
  const outKey = `${row.r2Key}.processed.${isVideo ? 'mp4' : 'jpg'}`
  const contentType = isVideo ? 'video/mp4' : 'image/jpeg'
  await db.update(mediaAssets).set({ processorRef: ref, processorSubmittedAt: new Date(), variants: { pendingKey: outKey }, updatedAt: new Date() }).where(eq(mediaAssets.id, row.id))
  await mediaProcessor().submit({
    assetId: row.id, ref, kind: row.kind,
    sourceUrl: await storage().presignGet({ key: row.r2Key, ttlSeconds: 3600 }),
    callbackUrl: `${env().siteUrl}/api/internal/media/callback`,
    outputs: [{ variant: 'main', putUrl: await storage().presignPut({ key: outKey, contentType, contentLength: 0, ttlSeconds: 3600 }), contentType }]
  })
  await enqueue(db, 'media.watchdog', { mediaId: row.id, workspaceId: row.workspaceId, ref }, { runAt: new Date(Date.now() + WATCHDOG_MS), singletonKey: ref })
}

/**
 * media.process (ARCHITECTURE §8.5): an upright JPEG/PNG within limits is ready inline; everything else
 * (HEIC, WebP, sideways photos, every video) goes to the media processor container.
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
  if (result.status === 'failed' || !result.outputs?.[0]) {
    const rows = await db.update(mediaAssets).set({ status: 'failed', error: FAILURE_COPY[result.error?.code ?? 'failed'] ?? FAILURE_COPY.failed, updatedAt: new Date() }).where(match).returning({ id: mediaAssets.id })
    return { applied: rows.length > 0 }
  }
  const main = result.outputs[0]
  const key = String((row.variants as { pendingKey?: string }).pendingKey)
  const rows = await db.update(mediaAssets).set({
    status: 'ready',
    mime: row.kind === 'video' ? 'video/mp4' : 'image/jpeg',
    width: main.width, height: main.height, durationMs: row.kind === 'video' ? main.durationMs : null, codec: main.codec, bytes: main.bytes,
    publicUrl: storage().publicUrl(key),
    variants: { main: key, original: row.r2Key, probe: result.probe ?? null },
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
  const resubmitted = Boolean((row.variants as { resubmitted?: boolean }).resubmitted)
  if (resubmitted) {
    await db.update(mediaAssets).set({ status: 'failed', error: FAILURE_COPY.timeout, updatedAt: new Date() }).where(and(eq(mediaAssets.id, row.id), eq(mediaAssets.status, 'processing')))
    return
  }
  ctx.log.warn('media.watchdog_resubmit', { mediaId: row.id })
  await submit(db, row)
  await db.update(mediaAssets).set({ variants: sql`${mediaAssets.variants} || '{"resubmitted": true}'::jsonb` }).where(eq(mediaAssets.id, row.id))
}
