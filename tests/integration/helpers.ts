import { sql } from 'drizzle-orm'
import { trackingDefer, type CoreContext } from '../../server/core/context'
import { getDb, type Database } from '../../server/core/db/client'
import { createLogger } from '../../server/core/log'

export function testContext(): CoreContext & { db: Database, flush: () => Promise<void> } {
  const log = createLogger({ test: true })
  const tracker = trackingDefer(log)
  return { db: getDb(), log, defer: tracker.defer, flush: tracker.flush }
}

export async function truncate(...tables: string[]) {
  await getDb().execute(sql.raw(`truncate ${tables.join(', ')} restart identity cascade`))
}
