import type { Database } from '../../core/db/client'
import { ingestMetaWebhook, verifyMetaSignature, type MetaWebhookPayload } from '../../core/autoreply/webhook'
import { kick } from '../../core/jobs'

/** Verify → store (deduped) + enqueue in one transaction → 200 fast → process after the response (rule 11). */
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, false)) ?? Buffer.alloc(0)
  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(raw.toString('utf8')) as MetaWebhookPayload
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' })
  }
  if (!verifyMetaSignature(raw, getRequestHeader(event, 'x-hub-signature-256'), payload.object)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }
  const ctx = requestContext(event)
  const jobIds = await ingestMetaWebhook(ctx.db as Database, payload)
  if (jobIds.length) ctx.defer(kick({ ...ctx, db: ctx.db as Database }, jobIds))
  return { ok: true }
})
