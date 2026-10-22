import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isValidTagBody, normalizeTag } from '../../../shared/hashtags/parse'
import { TAG_BREADTHS, TAG_NICHES, TAG_STATUSES, type LibraryTag, type TagNiche } from '../../../shared/hashtags/types'
import { recordAudit } from '../audit'
import { assertAbility, assertPermission, type StaffContext, type WorkspaceContext } from '../context'
import type { Executor } from '../db/client'
import { hashtagLibrary } from '../db/schema'
import { appError } from '../errors'

const TTL_MS = 60_000
const cacheKey = Symbol.for('socialz.hashtagLibrary')
type GlobalWithLibrary = typeof globalThis & { [cacheKey]?: { at: number, value: LibraryTag[] } }

/**
 * The whole tag list (a few hundred rows), cached per instance for a minute. An admin edit is
 * seen everywhere within that minute; the instance that made it sees it at once.
 */
export async function loadLibrary(db: Executor): Promise<LibraryTag[]> {
  const g = globalThis as GlobalWithLibrary
  const hit = g[cacheKey]
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const rows = await db.select({ tag: hashtagLibrary.tag, niche: hashtagLibrary.niche, keywords: hashtagLibrary.keywords, breadth: hashtagLibrary.breadth, status: hashtagLibrary.status, platforms: hashtagLibrary.platforms })
    .from(hashtagLibrary).orderBy(asc(hashtagLibrary.tag))
  const value = rows.map(row => ({ ...row, niche: row.niche as TagNiche }))
  g[cacheKey] = { at: Date.now(), value }
  return value
}

export function invalidateLibrary(): void {
  ;(globalThis as GlobalWithLibrary)[cacheKey] = undefined
}

/** The composer runs the quality check itself, so it needs the list, generic and blocked tags included. */
export async function libraryForComposer(ctx: WorkspaceContext) {
  assertAbility(ctx, 'posts.read')
  return { items: await loadLibrary(ctx.db) }
}

const word = z.string().trim().toLowerCase().min(2).max(30)
const fields = {
  tag: z.string().trim().min(1, 'Tulis tagarnya.').max(60)
    .transform(normalizeTag)
    .refine(isValidTagBody, 'Tagar hanya boleh huruf, angka dan garis bawah, tanpa spasi.'),
  niche: z.enum(TAG_NICHES),
  keywords: z.array(word).max(40, 'Maksimal 40 kata kunci.').transform(list => [...new Set(list)]),
  breadth: z.enum(TAG_BREADTHS),
  status: z.enum(TAG_STATUSES),
  platforms: z.array(z.enum(['instagram', 'threads', 'facebook'])),
  notes: z.string().trim().max(500).nullable().optional()
}
export const libraryTagSchema = z.object({
  ...fields,
  keywords: fields.keywords.default([]),
  breadth: fields.breadth.default('niche'),
  status: fields.status.default('recommended'),
  platforms: fields.platforms.default([])
})
/** PATCH: no defaults, so fields left out stay as they are. */
export const libraryTagPatchSchema = z.object(fields).partial()
export type LibraryTagInput = z.infer<typeof libraryTagSchema>

export const libraryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(60).default(''),
  niche: z.enum(TAG_NICHES).optional(),
  status: z.enum(TAG_STATUSES).optional()
})

const audit = (ctx: StaffContext, action: string, id: string, metadata?: Record<string, unknown>) =>
  recordAudit(ctx, { audience: 'staff', action, actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, targetType: 'hashtag', targetId: id, metadata })

export async function listLibrary(ctx: StaffContext, query: z.infer<typeof libraryQuerySchema>) {
  assertPermission(ctx, 'hashtags.read')
  const term = normalizeTag(query.search)
  const where = and(
    term ? or(ilike(hashtagLibrary.tag, `%${term}%`), sql`${term} = any(${hashtagLibrary.keywords})`) : undefined,
    query.niche ? eq(hashtagLibrary.niche, query.niche) : undefined,
    query.status ? eq(hashtagLibrary.status, query.status) : undefined
  )
  const [items, [total]] = await Promise.all([
    ctx.db.select().from(hashtagLibrary).where(where).orderBy(asc(hashtagLibrary.niche), asc(hashtagLibrary.tag)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(hashtagLibrary).where(where)
  ])
  const n = total?.n ?? 0
  return { items, meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) } }
}

export async function createLibraryTag(ctx: StaffContext, input: LibraryTagInput) {
  assertPermission(ctx, 'hashtags.write')
  const [row] = await ctx.db.insert(hashtagLibrary).values({ ...input, notes: input.notes ?? null })
    .onConflictDoNothing({ target: hashtagLibrary.tag }).returning({ id: hashtagLibrary.id })
  if (!row) throw appError(409, `#${input.tag} sudah ada di daftar.`, 'CONFLICT', { field: 'tag' })
  invalidateLibrary()
  await audit(ctx, 'hashtag.create', row.id, { tag: input.tag })
  return row
}

/** No delete: a tag that should go away becomes `blocked` or `generic`, so the quality check keeps knowing it. */
export async function updateLibraryTag(ctx: StaffContext, id: string, input: z.infer<typeof libraryTagPatchSchema>) {
  assertPermission(ctx, 'hashtags.write')
  const rows = await ctx.db.update(hashtagLibrary).set({ ...input, updatedAt: new Date() }).where(eq(hashtagLibrary.id, id)).returning({ id: hashtagLibrary.id })
    .catch((error: { code?: string, cause?: { code?: string } }) => {
      // Renamed onto a tag that already exists: the unique index decides.
      if ((error.code ?? error.cause?.code) === '23505') throw appError(409, `#${input.tag} sudah ada di daftar.`, 'CONFLICT', { field: 'tag' })
      throw error
    })
  if (!rows.length) throw appError(404, 'Tagar tidak ditemukan.', 'NOT_FOUND')
  invalidateLibrary()
  await audit(ctx, 'hashtag.update', id, { fields: Object.keys(input) })
}
