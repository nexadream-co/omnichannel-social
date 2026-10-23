import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  addDays, CONTENT_PILLARS, DEFAULT_POSTS_PER_WEEK, IDEA_MAX_LINKS, IDEA_MAX_MEDIA, IDEA_NOTE_MAX, IDEA_TITLE_MAX, IDEA_VIEWS,
  MAX_OPEN_IDEAS, MAX_POSTS_PER_WEEK, momentIdeaSkeletons, type MomentKind
} from '../../../shared/utils/planner'
import { recordAudit } from '../audit'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Executor } from '../db/client'
import { contentIdeaLinks, contentIdeaMedia, contentIdeas, links, mediaAssets, shoppingMoments, shortLinks, workspaces } from '../db/schema'
import { appError } from '../errors'
import { shortUrl } from '../links/service'
import { toMediaView } from '../media/service'
import { isDateKey, todayKey } from '../timezone'

const dayKey = z.string().refine(isDateKey, 'Tanggal tidak valid.')

const fields = {
  title: z.string().trim().min(1, 'Tulis idenya dulu, satu kalimat saja cukup.').max(IDEA_TITLE_MAX, `Ide maksimal ${IDEA_TITLE_MAX} huruf. Sisanya tulis di catatan.`),
  note: z.string().trim().max(IDEA_NOTE_MAX, `Catatan maksimal ${IDEA_NOTE_MAX} huruf.`).nullable(),
  pillar: z.enum(CONTENT_PILLARS).nullable(),
  plannedOn: dayKey.nullable(),
  linkIds: z.array(z.string().min(1)).max(IDEA_MAX_LINKS, `Maksimal ${IDEA_MAX_LINKS} produk per ide.`).transform(ids => [...new Set(ids)]),
  mediaIds: z.array(z.string().min(1)).max(IDEA_MAX_MEDIA, `Maksimal ${IDEA_MAX_MEDIA} foto atau video per ide.`).transform(ids => [...new Set(ids)])
}

export const ideaSchema = z.object({
  ...fields,
  note: fields.note.optional().default(null),
  pillar: fields.pillar.optional().default(null),
  plannedOn: fields.plannedOn.optional().default(null),
  linkIds: fields.linkIds.default([]),
  mediaIds: fields.mediaIds.default([])
})
/** PATCH: fields left out stay as they are. `status` only moves between open and archived ("Pulihkan" / "Arsipkan"). */
export const ideaPatchSchema = z.object({ ...fields, status: z.enum(['open', 'archived']) }).partial()
export type IdeaInput = z.infer<typeof ideaSchema>

export const ideaListSchema = z.object({ view: z.enum(IDEA_VIEWS).default('unplanned') })

type IdeaRow = typeof contentIdeas.$inferSelect

const audit = (ctx: WorkspaceContext, action: string, id: string, metadata?: Record<string, unknown>) =>
  recordAudit(ctx, { audience: 'creator', action, workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'content_idea', targetId: id, metadata })

export async function workspaceTimezone(db: Executor, workspaceId: string): Promise<string> {
  const [row] = await db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, workspaceId))
  return row?.timezone ?? 'Asia/Jakarta'
}

/** Products and media of many ideas at once, in their saved order. */
async function attachments(ctx: WorkspaceContext, ideaIds: string[]) {
  if (!ideaIds.length) return { linkRows: [], mediaRows: [] }
  const [linkRows, mediaRows] = await Promise.all([
    ctx.db.select({ ideaId: contentIdeaLinks.ideaId, id: links.id, title: links.title, merchant: links.merchant, imageUrl: links.imageUrl, destinationUrl: links.destinationUrl, slug: shortLinks.slug })
      .from(contentIdeaLinks).innerJoin(links, eq(links.id, contentIdeaLinks.linkId))
      .leftJoin(shortLinks, and(eq(shortLinks.linkId, links.id), eq(shortLinks.source, 'vault')))
      .where(and(eq(contentIdeaLinks.workspaceId, ctx.workspaceId), inArray(contentIdeaLinks.ideaId, ideaIds)))
      .orderBy(asc(contentIdeaLinks.position)),
    ctx.db.select({ ideaId: contentIdeaMedia.ideaId, media: mediaAssets })
      .from(contentIdeaMedia).innerJoin(mediaAssets, eq(mediaAssets.id, contentIdeaMedia.mediaId))
      .where(and(eq(contentIdeaMedia.workspaceId, ctx.workspaceId), inArray(contentIdeaMedia.ideaId, ideaIds)))
      .orderBy(asc(contentIdeaMedia.position))
  ])
  return { linkRows, mediaRows }
}

function toView(row: IdeaRow, extra: Awaited<ReturnType<typeof attachments>>) {
  return {
    id: row.id, title: row.title, note: row.note, pillar: row.pillar, plannedOn: row.plannedOn, status: row.status,
    postId: row.postId, momentId: row.momentId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    links: extra.linkRows.filter(l => l.ideaId === row.id).map(({ ideaId: _, slug, ...link }) => ({ ...link, shortUrl: slug ? shortUrl(slug) : null })),
    media: extra.mediaRows.filter(m => m.ideaId === row.id).map(m => toMediaView(m.media))
  }
}
export type IdeaView = ReturnType<typeof toView>

/** Products and media must belong to the workspace (404 otherwise, never a hint that they exist elsewhere). */
export async function assertOwned(ctx: WorkspaceContext, input: { linkIds?: string[], mediaIds?: string[] }) {
  if (input.linkIds?.length) {
    const found = await ctx.db.select({ id: links.id }).from(links).where(and(eq(links.workspaceId, ctx.workspaceId), inArray(links.id, input.linkIds)))
    if (found.length !== input.linkIds.length) throw appError(404, 'Produk tidak ditemukan.', 'NOT_FOUND', { field: 'linkIds' })
  }
  if (input.mediaIds?.length) {
    const found = await ctx.db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.workspaceId, ctx.workspaceId), inArray(mediaAssets.id, input.mediaIds)))
    if (found.length !== input.mediaIds.length) throw appError(404, 'Media tidak ditemukan.', 'NOT_FOUND', { field: 'mediaIds' })
  }
}

export async function assertRoomForIdeas(ctx: WorkspaceContext, adding: number) {
  const [row] = await ctx.db.select({ n: count() }).from(contentIdeas).where(and(eq(contentIdeas.workspaceId, ctx.workspaceId), eq(contentIdeas.status, 'open')))
  if ((row?.n ?? 0) + adding > MAX_OPEN_IDEAS) {
    throw appError(400, `Bank Ide sudah berisi ${MAX_OPEN_IDEAS} ide. Arsipkan ide yang sudah tidak dipakai dulu.`, 'VALIDATION_FAILED')
  }
}

async function replaceAttachments(tx: Executor, workspaceId: string, ideaId: string, input: { linkIds?: string[], mediaIds?: string[] }) {
  if (input.linkIds) {
    await tx.delete(contentIdeaLinks).where(eq(contentIdeaLinks.ideaId, ideaId))
    if (input.linkIds.length) await tx.insert(contentIdeaLinks).values(input.linkIds.map((linkId, position) => ({ workspaceId, ideaId, linkId, position })))
  }
  if (input.mediaIds) {
    await tx.delete(contentIdeaMedia).where(eq(contentIdeaMedia.ideaId, ideaId))
    if (input.mediaIds.length) await tx.insert(contentIdeaMedia).values(input.mediaIds.map((mediaId, position) => ({ workspaceId, ideaId, mediaId, position })))
  }
}

async function findIdea(ctx: WorkspaceContext, id: string) {
  const [row] = await ctx.db.select().from(contentIdeas).where(and(eq(contentIdeas.id, id), eq(contentIdeas.workspaceId, ctx.workspaceId))).limit(1)
  if (!row) throw appError(404, 'Ide tidak ditemukan.', 'NOT_FOUND')
  return row
}

export async function getIdea(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'posts.read')
  const row = await findIdea(ctx, id)
  return toView(row, await attachments(ctx, [id]))
}

export async function listIdeas(ctx: WorkspaceContext, query: { page: number, limit: number, offset: number, search: string } & z.infer<typeof ideaListSchema>) {
  assertAbility(ctx, 'posts.read')
  const byView = {
    unplanned: and(eq(contentIdeas.status, 'open'), isNull(contentIdeas.plannedOn)),
    planned: and(eq(contentIdeas.status, 'open'), isNotNull(contentIdeas.plannedOn)),
    used: eq(contentIdeas.status, 'used'),
    archived: eq(contentIdeas.status, 'archived')
  }[query.view]
  const where = and(
    eq(contentIdeas.workspaceId, ctx.workspaceId),
    byView,
    query.search ? sql`(${contentIdeas.title} ilike ${`%${query.search}%`} or ${contentIdeas.note} ilike ${`%${query.search}%`})` : undefined
  )
  const order = query.view === 'planned' ? [asc(contentIdeas.plannedOn), asc(contentIdeas.createdAt)] : query.view === 'unplanned' ? [desc(contentIdeas.createdAt)] : [desc(contentIdeas.updatedAt)]
  const [rows, [total]] = await Promise.all([
    ctx.db.select().from(contentIdeas).where(where).orderBy(...order).limit(query.limit).offset(query.offset),
    ctx.db.select({ n: count() }).from(contentIdeas).where(where)
  ])
  const extra = await attachments(ctx, rows.map(r => r.id))
  const n = total?.n ?? 0
  return { items: rows.map(row => toView(row, extra)), meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) } }
}

export async function createIdea(ctx: WorkspaceContext, input: IdeaInput) {
  assertAbility(ctx, 'posts.write')
  await assertRoomForIdeas(ctx, 1)
  await assertOwned(ctx, input)
  const id = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(contentIdeas).values({
      workspaceId: ctx.workspaceId, authorUserId: ctx.userId, title: input.title, note: input.note || null, pillar: input.pillar, plannedOn: input.plannedOn
    }).returning({ id: contentIdeas.id })
    await replaceAttachments(tx, ctx.workspaceId, row!.id, input)
    return row!.id
  })
  await audit(ctx, 'idea.create', id)
  return getIdea(ctx, id)
}

/** Edit, move on the calendar (`plannedOn`), archive or restore. An idea that became a post stays as it is. */
export async function updateIdea(ctx: WorkspaceContext, id: string, input: z.infer<typeof ideaPatchSchema>) {
  assertAbility(ctx, 'posts.write')
  const row = await findIdea(ctx, id)
  if (row.status === 'used') throw appError(409, 'Ide ini sudah jadi postingan. Ubah postingannya saja.', 'CONFLICT')
  if (input.status === 'open' && row.status === 'archived') await assertRoomForIdeas(ctx, 1)
  await assertOwned(ctx, input)
  const { linkIds, mediaIds, ...values } = input
  await ctx.db.transaction(async (tx) => {
    await tx.update(contentIdeas).set({ ...values, ...(values.note !== undefined && { note: values.note || null }), updatedAt: new Date() }).where(eq(contentIdeas.id, id))
    await replaceAttachments(tx, ctx.workspaceId, id, { linkIds, mediaIds })
  })
  await audit(ctx, input.status === 'archived' ? 'idea.archive' : 'idea.update', id, { fields: Object.keys(input) })
  return getIdea(ctx, id)
}

/** DELETE archives: an idea is cheap to keep and easy to bring back ("Pulihkan"). */
export async function archiveIdea(ctx: WorkspaceContext, id: string) {
  return updateIdea(ctx, id, { status: 'archived' })
}

// ---- Ideas ↔ posts (called inside the publishing service's transactions) ----

/** The composer saved a post from an idea: the idea leaves Bank Ide. A used or archived idea is left alone. */
export async function markIdeaUsed(tx: Executor, workspaceId: string, ideaId: string, postId: string) {
  await tx.update(contentIdeas).set({ status: 'used', postId, updatedAt: new Date() })
    .where(and(eq(contentIdeas.id, ideaId), eq(contentIdeas.workspaceId, workspaceId), eq(contentIdeas.status, 'open')))
}

/** The post was deleted: its idea goes back to Bank Ide, on the same planned day. */
export async function releaseIdeasOf(tx: Executor, workspaceId: string, postId: string) {
  await tx.update(contentIdeas).set({ status: 'open', postId: null, updatedAt: new Date() })
    .where(and(eq(contentIdeas.workspaceId, workspaceId), eq(contentIdeas.postId, postId)))
}

export async function ideaOfPost(db: Executor, workspaceId: string, postId: string) {
  const [row] = await db.select({ id: contentIdeas.id, title: contentIdeas.title }).from(contentIdeas)
    .where(and(eq(contentIdeas.workspaceId, workspaceId), eq(contentIdeas.postId, postId))).limit(1)
  return row ?? null
}

// ---- Calendar ----

/** Moments starting within this many days show on the Kalender before their week, so there is time to prepare. */
export const MOMENT_LOOKAHEAD_DAYS = 30

/**
 * Open ideas planned on local days in [fromDay, toDay), plus the moments that overlap the window or are coming
 * up soon (a week view alone would show 11.11 only when it is already too late to prepare).
 */
export async function plannerWindow(ctx: WorkspaceContext, fromDay: string, toDay: string, today: string) {
  const [ideas, moments, [workspace], [unplanned]] = await Promise.all([
    ctx.db.select({ id: contentIdeas.id, title: contentIdeas.title, pillar: contentIdeas.pillar, plannedOn: contentIdeas.plannedOn, momentId: contentIdeas.momentId })
      .from(contentIdeas)
      .where(and(eq(contentIdeas.workspaceId, ctx.workspaceId), eq(contentIdeas.status, 'open'), gte(contentIdeas.plannedOn, fromDay), lt(contentIdeas.plannedOn, toDay)))
      .orderBy(asc(contentIdeas.plannedOn), asc(contentIdeas.createdAt)),
    ctx.db.select({ id: shoppingMoments.id, name: shoppingMoments.name, nameEn: shoppingMoments.nameEn, kind: shoppingMoments.kind, startsOn: shoppingMoments.startsOn, endsOn: shoppingMoments.endsOn, prepDays: shoppingMoments.prepDays })
      .from(shoppingMoments)
      .where(and(eq(shoppingMoments.isActive, true), or(
        and(lt(shoppingMoments.startsOn, toDay), gte(shoppingMoments.endsOn, fromDay)),
        and(gte(shoppingMoments.endsOn, today), lt(shoppingMoments.startsOn, addDays(today, MOMENT_LOOKAHEAD_DAYS + 1)))
      )))
      .orderBy(asc(shoppingMoments.startsOn)),
    ctx.db.select({ postsPerWeek: workspaces.postsPerWeek }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)),
    ctx.db.select({ n: count() }).from(contentIdeas).where(and(eq(contentIdeas.workspaceId, ctx.workspaceId), eq(contentIdeas.status, 'open'), isNull(contentIdeas.plannedOn)))
  ])
  // Which moments this workspace already prepared (non-archived ideas made from them).
  const prepared = moments.length
    ? await ctx.db.selectDistinct({ momentId: contentIdeas.momentId }).from(contentIdeas)
        .where(and(eq(contentIdeas.workspaceId, ctx.workspaceId), ne(contentIdeas.status, 'archived'), inArray(contentIdeas.momentId, moments.map(m => m.id))))
    : []
  return {
    ideas,
    moments: moments.map(m => ({ ...m, prepared: prepared.some(p => p.momentId === m.id) })),
    postsPerWeek: workspace?.postsPerWeek ?? DEFAULT_POSTS_PER_WEEK,
    unplannedIdeas: unplanned?.n ?? 0 // with none, "+" on a day goes straight to the composer
  }
}

export const rhythmSchema = z.object({
  postsPerWeek: z.number().int().min(1, 'Target minimal 1 postingan per minggu.').max(MAX_POSTS_PER_WEEK, `Target maksimal ${MAX_POSTS_PER_WEEK} postingan per minggu.`)
})

/** "Target: 3 postingan/minggu" on the Kalender. A posting habit, so posts.write rather than settings. */
export async function setRhythm(ctx: WorkspaceContext, input: z.infer<typeof rhythmSchema>) {
  assertAbility(ctx, 'posts.write')
  await ctx.db.update(workspaces).set({ postsPerWeek: input.postsPerWeek, updatedAt: new Date() }).where(eq(workspaces.id, ctx.workspaceId))
  await recordAudit(ctx, { audience: 'creator', action: 'planner.rhythm', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, metadata: input })
  return { postsPerWeek: input.postsPerWeek }
}

export const prepareMomentSchema = z.object({ locale: z.enum(['id', 'en']).default('id') })

/** "Siapkan konten": three dated ideas for a moment. Once per moment, unless those ideas were archived. */
export async function prepareMoment(ctx: WorkspaceContext, momentId: string, input: z.infer<typeof prepareMomentSchema>) {
  assertAbility(ctx, 'posts.write')
  const [moment] = await ctx.db.select().from(shoppingMoments).where(and(eq(shoppingMoments.id, momentId), eq(shoppingMoments.isActive, true))).limit(1)
  if (!moment) throw appError(404, 'Momen tidak ditemukan.', 'NOT_FOUND')
  const today = todayKey(await workspaceTimezone(ctx.db, ctx.workspaceId))
  if (moment.endsOn < today) throw appError(409, 'Momen ini sudah lewat.', 'CONFLICT')
  const [already] = await ctx.db.select({ id: contentIdeas.id }).from(contentIdeas)
    .where(and(eq(contentIdeas.workspaceId, ctx.workspaceId), eq(contentIdeas.momentId, momentId), ne(contentIdeas.status, 'archived'))).limit(1)
  if (already) throw appError(409, 'Ide untuk momen ini sudah disiapkan. Cek di Kalender.', 'CONFLICT')
  const skeletons = momentIdeaSkeletons({ ...moment, kind: moment.kind as MomentKind }, today, input.locale)
  await assertRoomForIdeas(ctx, skeletons.length)
  const rows = await ctx.db.insert(contentIdeas).values(skeletons.map(s => ({
    workspaceId: ctx.workspaceId, authorUserId: ctx.userId, title: s.title, pillar: s.pillar, plannedOn: s.plannedOn, momentId
  }))).returning({ id: contentIdeas.id, plannedOn: contentIdeas.plannedOn })
  await recordAudit(ctx, { audience: 'creator', action: 'planner.prepare_moment', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'shopping_moment', targetId: momentId, metadata: { ideas: rows.length } })
  return { items: rows }
}
