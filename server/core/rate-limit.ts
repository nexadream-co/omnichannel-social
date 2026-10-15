import { sql } from 'drizzle-orm'
import type { Executor } from './db/client'
import { getDb } from './db/client'
import { appError } from './errors'

export const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 }

/**
 * Fixed window in Postgres (rate_limit_buckets, UNLOGGED), shared by every function instance.
 * One statement per check (docs/blueprint/16 §4).
 */
export async function consumeRateLimit(key: string, limit: number, windowMs: number, db: Executor = getDb(), now: Date = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  const expiresAt = new Date(windowStart.getTime() + windowMs)
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limit_buckets (key, window_start, count, expires_at)
    values (${key}, ${windowStart.toISOString()}, 1, ${expiresAt.toISOString()})
    on conflict (key, window_start) do update set count = rate_limit_buckets.count + 1
    returning count`)
  const count = Number(result.rows[0]?.count ?? 1)
  return {
    allowed: count <= limit,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
  }
}

export async function assertRateLimit(scope: string, identifier: string, limit: number, windowMs: number, db?: Executor): Promise<void> {
  const result = await consumeRateLimit(`${scope}:${identifier}`, limit, windowMs, db)
  if (!result.allowed) {
    throw appError(429, 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.', 'RATE_LIMITED', { retryAfterSeconds: result.retryAfterSeconds })
  }
}

export async function resetRateLimit(key: string, db: Executor = getDb()): Promise<void> {
  await db.execute(sql`delete from rate_limit_buckets where key = ${key}`)
}

export function clientIpFromHeaders(headers: Headers): string | null {
  return headers.get('cf-connecting-ip')
    || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || null
}
