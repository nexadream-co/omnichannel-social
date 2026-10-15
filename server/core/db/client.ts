import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env'
import * as schema from './schema'

export type Database = NodePgDatabase<typeof schema>
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
/** Anything that can run a query: the pool-backed db or an open transaction. */
export type Executor = Database | Transaction

interface DbHolder {
  pool: pg.Pool
  db: Database
}

const globalKey = Symbol.for('socialz.db')
type GlobalWithDb = typeof globalThis & { [globalKey]?: DbHolder }

/**
 * One small pool per function instance, on the POOLED Neon URL (docs/blueprint/01 §6).
 * Created lazily and cached on globalThis so warm invocations and dev hot reloads reuse it.
 * No session features (LISTEN, session advisory locks, session SET) — PgBouncer transaction mode.
 */
function holder(): DbHolder {
  const g = globalThis as GlobalWithDb
  if (!g[globalKey]) {
    const config = env()
    if (config.DB_DRIVER !== 'pg') {
      throw new Error(`DB_DRIVER=${config.DB_DRIVER} is not wired yet; see docs/blueprint/19 §6`)
    }
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: config.DB_POOL_MAX || 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000
    })
    pool.on('error', (error) => {
      // An idle client died (Neon suspend, network). The pool replaces it on next use.
      console.error(JSON.stringify({ level: 'error', msg: 'db.pool_error', error: error.message }))
    })
    g[globalKey] = { pool, db: drizzle(pool, { schema, casing: 'snake_case' }) }
  }
  return g[globalKey]!
}

export function getDb(): Database {
  return holder().db
}

export function getPool(): pg.Pool {
  return holder().pool
}

/** Scripts and tests only. Functions never close the pool (the host freezes the instance). */
export async function closeDb() {
  const g = globalThis as GlobalWithDb
  if (g[globalKey]) {
    await g[globalKey]!.pool.end()
    g[globalKey] = undefined
  }
}
