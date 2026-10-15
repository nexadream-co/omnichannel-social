import { safeEqual } from '../../core/crypto'
import type { Database } from '../../core/db/client'
import { env } from '../../core/env'
import { runTick } from '../../core/jobs'

/** GET or POST, Authorization: Bearer $CRON_SECRET (docs/blueprint/15 §4). 404 to anyone else. */
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'POST') throw createError({ statusCode: 405 })
  const secret = env().CRON_SECRET
  const header = getRequestHeader(event, 'authorization') ?? ''
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw createError({ statusCode: 404 })
  const ctx = requestContext(event)
  return runTick({ ...ctx, db: ctx.db as Database })
})
