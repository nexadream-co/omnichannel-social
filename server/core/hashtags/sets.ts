import { and, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { isValidTagBody, normalizeTag } from '../../../shared/hashtags/parse'
import { recordAudit } from '../audit'
import { assertAbility, type WorkspaceContext } from '../context'
import { hashtagSets } from '../db/schema'
import { appError } from '../errors'

/** A sanity cap, not a plan limit: saved sets are free on every plan. */
export const MAX_HASHTAG_SETS = 50

/** Tags are stored as typed (no '#'), deduplicated ignoring case. */
const tagList = z.array(z.string().trim().max(60)).max(30, 'Maksimal 30 tagar per set.')
  .transform((tags, ctx) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of tags) {
      const tag = raw.replace(/^#+/, '')
      if (!tag) continue
      if (!isValidTagBody(tag)) {
        ctx.addIssue({ code: 'custom', message: `#${tag} tidak bisa dipakai: tagar hanya boleh huruf, angka dan garis bawah, tanpa spasi.` })
        return z.NEVER
      }
      if (seen.has(normalizeTag(tag))) continue
      seen.add(normalizeTag(tag))
      out.push(tag)
    }
    return out
  })
  .refine(tags => tags.length > 0, 'Tambahkan minimal satu tagar.')

export const hashtagSetSchema = z.object({
  name: z.string().trim().min(1, 'Beri nama set, misalnya "Skincare".').max(40, 'Nama set maksimal 40 huruf.'),
  tags: tagList
})
export type HashtagSetInput = z.infer<typeof hashtagSetSchema>

function toView(row: typeof hashtagSets.$inferSelect) {
  return { id: row.id, name: row.name, tags: row.tags, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function listHashtagSets(ctx: WorkspaceContext) {
  assertAbility(ctx, 'posts.read')
  const rows = await ctx.db.select().from(hashtagSets).where(eq(hashtagSets.workspaceId, ctx.workspaceId)).orderBy(desc(hashtagSets.updatedAt)).limit(MAX_HASHTAG_SETS)
  return { items: rows.map(toView), meta: { page: 1, limit: MAX_HASHTAG_SETS, total: rows.length, pageCount: 1 } }
}

export async function createHashtagSet(ctx: WorkspaceContext, input: HashtagSetInput) {
  assertAbility(ctx, 'posts.write')
  const [existing] = await ctx.db.select({ n: count() }).from(hashtagSets).where(eq(hashtagSets.workspaceId, ctx.workspaceId))
  if ((existing?.n ?? 0) >= MAX_HASHTAG_SETS) throw appError(400, `Maksimal ${MAX_HASHTAG_SETS} set tagar. Hapus set yang sudah tidak dipakai dulu.`, 'VALIDATION_FAILED')
  const [row] = await ctx.db.insert(hashtagSets).values({ workspaceId: ctx.workspaceId, name: input.name, tags: input.tags, createdBy: ctx.userId }).returning()
  await recordAudit(ctx, { audience: 'creator', action: 'hashtag_set.create', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'hashtag_set', targetId: row!.id })
  return toView(row!)
}

export async function updateHashtagSet(ctx: WorkspaceContext, id: string, input: Partial<HashtagSetInput>) {
  assertAbility(ctx, 'posts.write')
  const [row] = await ctx.db.update(hashtagSets).set({ ...input, updatedAt: new Date() })
    .where(and(eq(hashtagSets.id, id), eq(hashtagSets.workspaceId, ctx.workspaceId))).returning()
  if (!row) throw appError(404, 'Set tagar tidak ditemukan.', 'NOT_FOUND')
  await recordAudit(ctx, { audience: 'creator', action: 'hashtag_set.update', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'hashtag_set', targetId: id })
  return toView(row)
}

export async function deleteHashtagSet(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'posts.write')
  const rows = await ctx.db.delete(hashtagSets).where(and(eq(hashtagSets.id, id), eq(hashtagSets.workspaceId, ctx.workspaceId))).returning({ id: hashtagSets.id })
  if (!rows.length) throw appError(404, 'Set tagar tidak ditemukan.', 'NOT_FOUND')
  await recordAudit(ctx, { audience: 'creator', action: 'hashtag_set.delete', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'hashtag_set', targetId: id })
}
