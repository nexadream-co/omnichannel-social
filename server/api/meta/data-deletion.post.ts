import type { Database } from '../../core/db/client'
import { handleDataDeletion } from '../../core/meta-callbacks'

/** Meta posts application/x-www-form-urlencoded with signed_request (ARCHITECTURE §9.4). */
export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, string>>(event).catch((): Record<string, string> => ({}))
  const ctx = requestContext(event)
  return handleDataDeletion({ ...ctx, db: ctx.db as Database }, String(body?.signed_request ?? ''))
})
