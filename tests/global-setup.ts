import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

/** Fresh schema for the test database, then migrations (the same files production applies). */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://socialz:socialz@localhost:5432/socialz_test'
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;')
  await migrate(drizzle(pool), { migrationsFolder: 'server/core/db/migrations' })
  await pool.end()
}
