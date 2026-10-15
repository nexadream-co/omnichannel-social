import { z } from 'zod'

const bool = z.enum(['true', 'false', '1', '0', '']).optional().transform(v => v === 'true' || v === '1')
const int = (fallback: number) => z.coerce.number().int().nonnegative().default(fallback)

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  NUXT_PUBLIC_APP_ENV: z.string().default('development'),
  NUXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NUXT_PUBLIC_SHORT_URL: z.url().default('http://localhost:3000'),
  NUXT_PUBLIC_MEDIA_URL: z.string().default(''),

  DATABASE_URL: z.string().min(1),
  DB_DRIVER: z.enum(['pg', 'neon-ws']).default('pg'),
  DB_POOL_MAX: int(3),

  BETTER_AUTH_SECRET: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  SETTINGS_SECRET: z.string().default(''),

  CRON_SECRET: z.string().default(''),
  INTERNAL_SIGNING_SECRET: z.string().default(''),
  JOBS_TIME_BUDGET_MS: int(45_000),
  JOBS_FANOUT_MAX: int(4),

  MEDIA_PROCESSOR_DRIVER: z.enum(['http', 'local', 'fake']).default('local'),
  MEDIA_PROCESSOR_URL: z.string().default(''),
  MEDIA_PROCESSOR_SECRET: z.string().default(''),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default(''),
  R2_ENDPOINT: z.string().default(''),
  STORAGE_DRIVER: z.enum(['r2', 'fake']).default('r2'),

  META_APP_ID: z.string().default(''),
  META_APP_SECRET: z.string().default(''),
  META_GRAPH_VERSION: z.string().default('v25.0'),
  INSTAGRAM_APP_ID: z.string().default(''),
  INSTAGRAM_APP_SECRET: z.string().default(''),
  THREADS_APP_ID: z.string().default(''),
  THREADS_APP_SECRET: z.string().default(''),
  META_WEBHOOK_VERIFY_TOKEN: z.string().default(''),

  MAILPIT_URL: z.string().default(''),
  ADAPTER_MODE: z.enum(['real', 'fake']).default('real'),
  DEBUG_JOBS: bool
})

export type Env = z.infer<typeof schema> & {
  isProduction: boolean
  siteUrl: string
  siteOrigin: string
  shortUrl: string
}

const REQUIRED_IN_PRODUCTION = ['BETTER_AUTH_SECRET', 'SETTINGS_SECRET', 'CRON_SECRET', 'INTERNAL_SIGNING_SECRET'] as const

let cached: Env | undefined

/**
 * Parses process.env once per function instance (docs/blueprint/19 §2 rule 8).
 * Throws with a readable message when a required value is missing.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const fields = parsed.error.issues.map(i => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment: ${fields}`)
  }
  const value = parsed.data
  const isProduction = value.NUXT_PUBLIC_APP_ENV === 'production'
  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter(key => !value[key])
    if (missing.length) throw new Error(`Missing required environment in production: ${missing.join(', ')}`)
    if (value.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters in production')
  }
  const siteUrl = value.NUXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  return {
    ...value,
    isProduction,
    siteUrl,
    siteOrigin: new URL(siteUrl).origin,
    shortUrl: value.NUXT_PUBLIC_SHORT_URL.replace(/\/+$/, '')
  }
}

export function env(): Env {
  cached ??= loadEnv()
  return cached
}

/** Tests only. */
export function resetEnvCache() {
  cached = undefined
}
