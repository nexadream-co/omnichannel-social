import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { loadDotEnv } from './_env'

loadDotEnv()

/**
 * Runs inside `npm run build`: applies migrations, then seeds a FRESH database once.
 * "Fresh" = no staff user yet (the seed's last step creates the superadmin), so a live
 * environment is never re-seeded and admin edits survive. SKIP_DB_DEPLOY=1 builds without
 * a database (CI preset builds). Then, on every build, the content sync (starter templates for workspaces that never
 * got them, a fresh "Lagi rame" read); best effort, so a blocked news feed never fails a deploy.
 */
if (process.env.SKIP_DB_DEPLOY === '1') {
  console.log('SKIP_DB_DEPLOY=1: migrations and seed skipped.')
  process.exit(0)
}

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL_DIRECT (or DATABASE_URL) is required to build; set SKIP_DB_DEPLOY=1 to build without a database')

// Session advisory lock on the direct URL: two builds hitting the same database run one after the other.
const LOCK_KEY = 728_311_001
const pool = new pg.Pool({ connectionString: url, max: 2 })
const lock = await pool.connect()
try {
  await lock.query('select pg_advisory_lock($1)', [LOCK_KEY])
  await migrate(drizzle(pool), { migrationsFolder: 'server/core/db/migrations' })
  console.log('Migrations applied.')

  const { rows } = await pool.query<{ seeded: boolean }>('select exists (select 1 from staff_users) as seeded')
  if (!rows[0]?.seeded) {
    console.log('Fresh database: running the seed.')
    await import('./seed')
  } else {
    console.log('Database already seeded: seed skipped.')
  }
} finally {
  await lock.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
  lock.release()
  await pool.end()
}

try {
  const { closeDb } = await import('../server/core/db/client')
  const { baseContext } = await import('../server/core/context')
  const { syncContent } = await import('../server/core/content-sync')
  const result = await syncContent(baseContext())
  console.log(`Content sync: starter templates added to ${result.templates} workspace(s); Lagi rame ${JSON.stringify(result.news)}.`)
  await closeDb()
} catch (error) {
  console.warn(`Content sync skipped: ${(error as Error).message}. Run \`npm run content:sync\` later.`)
}
