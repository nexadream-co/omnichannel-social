import type { Database } from '../../core/db/client'
import { handleDeauthorize } from '../../core/meta-callbacks'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, string>>(event).catch((): Record<string, string> => ({}))
  const ctx = requestContext(event)
  return handleDeauthorize({ ...ctx, db: ctx.db as Database }, String(body?.signed_request ?? ''))
})
