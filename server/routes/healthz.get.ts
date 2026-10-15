import type { Database } from '../core/db/client'
import { getDb } from '../core/db/client'
import { checkHealth } from '../core/jobs'

export default defineEventHandler(async (event) => {
  const health = await checkHealth(getDb() as Database)
  setResponseHeader(event, 'cache-control', 'no-store')
  if (!health.ok) setResponseStatus(event, 503)
  return health
})
