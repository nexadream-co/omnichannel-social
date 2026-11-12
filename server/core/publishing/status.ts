import { eq } from 'drizzle-orm'
import type { Executor } from '../db/client'
import { posts, postTargets } from '../db/schema'
import { syncStageForPost } from '../planner/stage'

const IN_FLIGHT = new Set(['preparing', 'processing', 'publishing', 'publish_unknown', 'retrying'])

/** The parent post status is derived from its targets (ARCHITECTURE §8.2). */
export function derivePostStatus(statuses: string[]): 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed' | 'cancelled' {
  const live = statuses.filter(s => s !== 'cancelled')
  if (!statuses.length || statuses.every(s => s === 'draft')) return 'draft'
  if (!live.length) return 'cancelled'
  if (live.some(s => IN_FLIGHT.has(s))) return 'publishing'
  if (live.every(s => s === 'published')) return 'published'
  if (live.every(s => s === 'failed')) return 'failed'
  if (live.some(s => s === 'published') && live.some(s => s === 'failed')) return 'partial'
  return 'scheduled'
}

export async function refreshPostStatus(db: Executor, postId: string): Promise<void> {
  const rows = await db.select({ status: postTargets.status }).from(postTargets).where(eq(postTargets.postId, postId))
  const status = derivePostStatus(rows.map(r => r.status))
  await db.update(posts).set({ status, updatedAt: new Date() }).where(eq(posts.id, postId))
  await syncStageForPost(db, postId, status)
}
