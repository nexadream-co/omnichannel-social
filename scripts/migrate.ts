import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { loadDotEnv } from './_env'

loadDotEnv()

/** Applies migrations with the DIRECT database URL (CI step before each deploy; docs/blueprint/19 §3). */
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL_DIRECT (or DATABASE_URL) is required')

const pool = new pg.Pool({ connectionString: url, max: 1 })
try {
  await migrate(drizzle(pool), { migrationsFolder: 'server/core/db/migrations' })
  console.log('Migrations applied.')
} finally {
  await pool.end()
}
