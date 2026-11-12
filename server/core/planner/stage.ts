import { and, asc, count, eq, min, ne } from 'drizzle-orm'
import { actualStage, ideaHasDetail, postStage, type IdeaStage, type PostStatus } from '../../../shared/utils/planner'
import type { Executor } from '../db/client'
import { contentIdeaLinks, contentIdeaMedia, contentIdeas, posts } from '../db/schema'

/**
 * Board stage writers. Kept free of imports from ideas.ts and the publishing service so both can call them
 * without a cycle. Rule: write `actualStage` when something real changes, but never pull a `drafting` card back to `raw`.
 */

export async function computeActualStage(db: Executor, workspaceId: string, ideaId: string): Promise<{ stage: IdeaStage, actual: IdeaStage } | null> {
  const [idea] = await db.select().from(contentIdeas).where(and(eq(contentIdeas.id, ideaId), eq(contentIdeas.workspaceId, workspaceId))).limit(1)
  if (!idea) return null
  const [[linkRow], [mediaRow], post] = await Promise.all([
    db.select({ n: count() }).from(contentIdeaLinks).where(eq(contentIdeaLinks.ideaId, ideaId)),
    db.select({ n: count() }).from(contentIdeaMedia).where(eq(contentIdeaMedia.ideaId, ideaId)),
    idea.postId ? db.select({ status: posts.status }).from(posts).where(eq(posts.id, idea.postId)).limit(1).then(r => r[0] ?? null) : Promise.resolve(null)
  ])
  const hasDetail = ideaHasDetail({ note: idea.note, pillar: idea.pillar, plannedOn: idea.plannedOn, momentId: idea.momentId, linkCount: linkRow?.n ?? 0, mediaCount: mediaRow?.n ?? 0 })
  return { stage: idea.stage, actual: actualStage({ postStatus: post?.status ?? null, hasDetail }) }
}

export const ORDER_STEP = 1024

/** A board order that sits above every card in the column. */
export async function topOrder(db: Executor, workspaceId: string, stage: IdeaStage): Promise<number> {
  const [row] = await db.select({ lowest: min(contentIdeas.boardOrder) }).from(contentIdeas)
    .where(and(eq(contentIdeas.workspaceId, workspaceId), eq(contentIdeas.stage, stage)))
  return row?.lowest == null ? 0 : row.lowest - ORDER_STEP
}

/** Renumber a column to row_number * 1024 in its current order (used when two neighbours run out of room). */
export async function renumberColumn(db: Executor, workspaceId: string, stage: IdeaStage): Promise<void> {
  const rows = await db.select({ id: contentIdeas.id }).from(contentIdeas)
    .where(and(eq(contentIdeas.workspaceId, workspaceId), eq(contentIdeas.stage, stage)))
    .orderBy(asc(contentIdeas.boardOrder), asc(contentIdeas.id))
  for (const [i, row] of rows.entries()) {
    await db.update(contentIdeas).set({ boardOrder: (i + 1) * ORDER_STEP }).where(eq(contentIdeas.id, row.id))
  }
}

/**
 * Recompute one idea's stage from its row, attachments and post. Writes only when the stage changes, and the card
 * then goes to the top of its new column. `isNew` also places a just-created card on top of its column.
 */
export async function syncIdeaStage(db: Executor, workspaceId: string, ideaId: string, options: { isNew?: boolean } = {}): Promise<void> {
  const state = await computeActualStage(db, workspaceId, ideaId)
  if (!state) return
  const next = state.stage === 'drafting' && state.actual === 'raw' ? 'drafting' : state.actual
  if (next === state.stage && !options.isNew) return
  const boardOrder = await topOrder(db, workspaceId, next)
  await db.update(contentIdeas).set({ stage: next, stageChangedAt: new Date(), boardOrder }).where(and(eq(contentIdeas.id, ideaId), eq(contentIdeas.workspaceId, workspaceId)))
}

/** A post's status changed: its idea follows, to the top of the new column. */
export async function syncStageForPost(db: Executor, postId: string, status: PostStatus): Promise<void> {
  const stage = postStage(status)
  const rows = await db.select({ id: contentIdeas.id, workspaceId: contentIdeas.workspaceId }).from(contentIdeas)
    .where(and(eq(contentIdeas.postId, postId), ne(contentIdeas.stage, stage)))
  for (const row of rows) {
    await db.update(contentIdeas).set({ stage, stageChangedAt: new Date(), boardOrder: await topOrder(db, row.workspaceId, stage) }).where(eq(contentIdeas.id, row.id))
  }
}
