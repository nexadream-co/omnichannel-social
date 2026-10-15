import { createHash, createHmac } from 'node:crypto'
import { and, eq, ne } from 'drizzle-orm'
import { PRIVATE_REPLY_WINDOW_MS } from '../../../shared/utils/autoreply'
import type { CoreContext } from '../context'
import { safeEqual } from '../crypto'
import type { Database, Executor } from '../db/client'
import { dmEvents, socialAccounts, webhookEvents } from '../db/schema'
import { env } from '../env'
import { enqueue } from '../jobs/enqueue'
import type { JobHandler } from '../jobs/types'
import { findMatchingRule } from './rules'

/**
 * Meta webhooks (ARCHITECTURE §9.1). Instagram-Login webhooks are signed with the Instagram app secret,
 * Page webhooks with the Facebook app secret, Threads with the Threads app secret: pick by `object`.
 */
function secretFor(object: string | undefined): string {
  const config = env()
  if (object === 'instagram') return config.INSTAGRAM_APP_SECRET
  if (object === 'threads') return config.THREADS_APP_SECRET
  return config.META_APP_SECRET
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret). Constant-time compare. */
export function verifyMetaSignature(raw: Buffer, header: string | undefined, object: string | undefined): boolean {
  const secret = secretFor(object)
  if (!secret || !header?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  return safeEqual(header.slice('sha256='.length), expected)
}

export function verifySubscription(query: Record<string, unknown>): string | null {
  const token = env().META_WEBHOOK_VERIFY_TOKEN
  if (!token || query['hub.mode'] !== 'subscribe' || typeof query['hub.verify_token'] !== 'string') return null
  if (!safeEqual(query['hub.verify_token'], token)) return null
  return typeof query['hub.challenge'] === 'string' ? query['hub.challenge'] : null
}

interface MetaChange { field?: string, value?: Record<string, unknown> }
interface MetaEntry { id?: string | number, time?: number, changes?: MetaChange[] }
export interface MetaWebhookPayload { object?: string, entry?: MetaEntry[] }

function dedupeKey(object: string, entryId: string, change: MetaChange): string {
  const commentId = change.value && typeof change.value.id === 'string' ? change.value.id : null
  if (change.field === 'comments' && commentId) return `${object}:comment:${commentId}`
  return `${object}:${change.field ?? 'unknown'}:${createHash('sha256').update(`${entryId}|${JSON.stringify(change.value ?? {})}`).digest('hex').slice(0, 32)}`
}

/**
 * One row per change, deduped, with its job enqueued in the same transaction (rule 11).
 * Returns the new job ids so the route can kick them after responding.
 */
export async function ingestMetaWebhook(db: Database, payload: MetaWebhookPayload): Promise<string[]> {
  const object = payload.object ?? 'unknown'
  const jobIds: string[] = []
  await db.transaction(async (tx) => {
    for (const entry of payload.entry ?? []) {
      const entryId = String(entry.id ?? '')
      for (const change of entry.changes ?? []) {
        const [row] = await tx.insert(webhookEvents).values({
          provider: 'meta', topic: `${object}.${change.field ?? 'unknown'}`, dedupeKey: dedupeKey(object, entryId, change),
          payload: { object, entryId, time: entry.time ?? null, field: change.field ?? null, value: change.value ?? {} }
        }).onConflictDoNothing().returning({ id: webhookEvents.id })
        if (!row) continue // a replay: already stored and handled
        const jobId = await enqueue(tx, 'webhook.meta', { webhookEventId: row.id })
        if (jobId) jobIds.push(jobId)
      }
    }
  })
  return jobIds
}

interface StoredChange { object: string, entryId: string, time: number | null, field: string | null, value: Record<string, unknown> }

/**
 * webhook.meta: an Instagram comment → match a rule → dm_events row (UNIQUE per comment) + dm.send job.
 * Own comments (our public replies) and comments older than the private-reply window are ignored.
 */
export const webhookMetaJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const id = String(job.payload.webhookEventId ?? '')
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1)
  if (!event || event.processedAt) return
  const change = event.payload as StoredChange
  const sendJobs: string[] = []
  if (change.object === 'instagram' && change.field === 'comments') {
    sendJobs.push(...await handleComment(ctx, change))
  }
  await db.update(webhookEvents).set({ processedAt: new Date(), attempts: event.attempts + 1 }).where(eq(webhookEvents.id, id))
  if (sendJobs.length) {
    // Lazy: the runner imports the handler list, which imports this module.
    const { kick } = await import('../jobs/runner')
    ctx.defer(kick({ ...ctx, db }, sendJobs))
  }
}

async function handleComment(ctx: CoreContext, change: StoredChange): Promise<string[]> {
  const db = ctx.db as Database
  const value = change.value
  const commentId = typeof value.id === 'string' ? value.id : null
  const from = (value.from ?? {}) as { id?: string, username?: string }
  const media = (value.media ?? {}) as { id?: string }
  const text = typeof value.text === 'string' ? value.text : ''
  if (!commentId || !from.id) return []
  if (change.time && Date.now() - change.time * 1000 > PRIVATE_REPLY_WINDOW_MS) return []

  const [account] = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.platform, 'instagram'), eq(socialAccounts.externalId, change.entryId), ne(socialAccounts.status, 'revoked'))).limit(1)
  if (!account) return []
  if (from.id === account.externalId) return [] // our own public reply coming back

  const rule = await findMatchingRule(db, account.id, media.id ?? null, text)
  if (!rule) return []
  const accountActive = account.status === 'active'
  return db.transaction(async (tx: Executor) => {
    const [row] = await tx.insert(dmEvents).values({
      workspaceId: account.workspaceId, ruleId: rule.id, socialAccountId: account.id, commentId, commenterId: from.id!,
      commenterUsername: from.username ?? null, mediaId: media.id ?? null, commentText: text.slice(0, 2000),
      status: accountActive ? 'matched' : 'skipped', error: accountActive ? null : 'account_inactive'
    }).onConflictDoNothing().returning({ id: dmEvents.id })
    if (!row || !accountActive) return []
    const jobId = await enqueue(tx, 'dm.send', { dmEventId: row.id, workspaceId: account.workspaceId }, { singletonKey: `dm:${row.id}` })
    return jobId ? [jobId] : []
  })
}
