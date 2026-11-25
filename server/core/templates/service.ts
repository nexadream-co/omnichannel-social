import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { recordAudit } from '../audit'
import { STARTER_POST_TEMPLATES } from '../../../shared/utils/post-templates'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Executor } from '../db/client'
import { postTemplates, workspaces } from '../db/schema'
import { appError } from '../errors'

/** A sanity cap, not a plan limit: templates are free on every plan. */
export const MAX_POST_TEMPLATES = 100
/** Instagram's caption limit, the longest any platform takes. */
const CAPTION_MAX = 2200

export const postTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Beri nama template, misalnya "Review skincare".').max(40, 'Nama template maksimal 40 huruf.'),
  caption: z.string().trim().min(1, 'Tulis caption dulu, lalu simpan sebagai template.').max(CAPTION_MAX, `Caption template maksimal ${CAPTION_MAX} karakter.`)
})
export type PostTemplateInput = z.infer<typeof postTemplateSchema>

function toView(row: typeof postTemplates.$inferSelect) {
  return { id: row.id, name: row.name, caption: row.caption, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

const notFound = () => appError(404, 'Template tidak ditemukan.', 'NOT_FOUND')

export async function listPostTemplates(ctx: WorkspaceContext) {
  assertAbility(ctx, 'posts.read')
  const rows = await ctx.db.select().from(postTemplates).where(eq(postTemplates.workspaceId, ctx.workspaceId)).orderBy(desc(postTemplates.updatedAt)).limit(MAX_POST_TEMPLATES)
  return { items: rows.map(toView), meta: { page: 1, limit: MAX_POST_TEMPLATES, total: rows.length, pageCount: 1 } }
}

export async function createPostTemplate(ctx: WorkspaceContext, input: PostTemplateInput) {
  assertAbility(ctx, 'posts.write')
  const [existing] = await ctx.db.select({ n: count() }).from(postTemplates).where(eq(postTemplates.workspaceId, ctx.workspaceId))
  if ((existing?.n ?? 0) >= MAX_POST_TEMPLATES) throw appError(400, `Maksimal ${MAX_POST_TEMPLATES} template. Hapus template yang sudah tidak dipakai dulu.`, 'VALIDATION_FAILED')
  const [row] = await ctx.db.insert(postTemplates).values({ workspaceId: ctx.workspaceId, name: input.name, caption: input.caption, createdBy: ctx.userId }).returning()
  await recordAudit(ctx, { audience: 'creator', action: 'post_template.create', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'post_template', targetId: row!.id })
  return toView(row!)
}

export async function updatePostTemplate(ctx: WorkspaceContext, id: string, input: Partial<PostTemplateInput>) {
  assertAbility(ctx, 'posts.write')
  const [row] = await ctx.db.update(postTemplates).set({ ...input, updatedAt: new Date() })
    .where(and(eq(postTemplates.id, id), eq(postTemplates.workspaceId, ctx.workspaceId))).returning()
  if (!row) throw notFound()
  await recordAudit(ctx, { audience: 'creator', action: 'post_template.update', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'post_template', targetId: id })
  return toView(row)
}

export async function deletePostTemplate(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'posts.write')
  const rows = await ctx.db.delete(postTemplates).where(and(eq(postTemplates.id, id), eq(postTemplates.workspaceId, ctx.workspaceId))).returning({ id: postTemplates.id })
  if (!rows.length) throw notFound()
  await recordAudit(ctx, { audience: 'creator', action: 'post_template.delete', workspaceId: ctx.workspaceId, actorId: ctx.userId, impersonatorId: ctx.impersonatorId, targetType: 'post_template', targetId: id })
}

/**
 * Copies the starter captions into a workspace, once: sign-up, or the content sync for workspaces made before starters
 * existed. `starter_templates_at` marks it done, so a creator's deleted starters never come back. A starter whose name
 * the workspace already uses is skipped. Staggered timestamps keep the order of STARTER_POST_TEMPLATES (newest first).
 * Returns how many were added.
 */
export async function addStarterTemplates(db: Executor, workspaceId: string, now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    // Claim the workspace first: two syncs at once (a deploy and the hourly run) can't both copy.
    const claimed = await tx.update(workspaces).set({ starterTemplatesAt: now })
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.starterTemplatesAt))).returning({ id: workspaces.id })
    if (!claimed.length) return 0
    const have = new Set((await tx.select({ name: postTemplates.name }).from(postTemplates).where(eq(postTemplates.workspaceId, workspaceId))).map(row => row.name))
    const missing = STARTER_POST_TEMPLATES.filter(template => !have.has(template.name))
    if (!missing.length) return 0
    await tx.insert(postTemplates).values(missing.map((template, index) => {
      const at = new Date(now.getTime() - index * 1000)
      return { workspaceId, name: template.name, caption: template.caption, createdAt: at, updatedAt: at }
    }))
    return missing.length
  })
}

/** Every live workspace that never got the starters (made before they existed). Returns workspaces filled. */
export async function backfillStarterTemplates(db: Executor): Promise<number> {
  const pending = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(isNull(workspaces.starterTemplatesAt), isNull(workspaces.deletedAt)))
  let filled = 0
  for (const workspace of pending) {
    if (await addStarterTemplates(db, workspace.id)) filled++
  }
  return filled
}
