import type { Database } from '../../../core/db/client'
import { env } from '../../../core/env'
import { runDue, SIGNATURE_HEADER, verifySignature } from '../../../core/jobs'

/** Fan-out target: a fresh invocation with its own budget (docs/blueprint/15 §1.5). HMAC-signed. */
export default defineEventHandler(async (event) => {
  const body = (await readRawBody(event, 'utf8')) ?? ''
  if (!verifySignature(env().INTERNAL_SIGNING_SECRET, body, getRequestHeader(event, SIGNATURE_HEADER))) {
    throw createError({ statusCode: 404 })
  }
  const ctx = requestContext(event)
  return runDue({ ...ctx, db: ctx.db as Database }, { budgetMs: env().JOBS_TIME_BUDGET_MS })
})
