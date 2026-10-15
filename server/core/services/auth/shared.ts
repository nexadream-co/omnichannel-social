import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { BetterAuthOptions } from 'better-auth'
import { uuidv7 } from 'uuidv7'
import { normalizeEmail } from '../../../../shared/utils/auth'
import { recordAudit } from '../../audit'
import { baseContext } from '../../context'
import { env } from '../../env'
import { consumeRateLimit, resetRateLimit } from '../../rate-limit'
import { deferInScope } from '../../request-scope'
import type { Audience } from './types'

export const INVALID_CREDENTIALS = 'Email atau kata sandi salah.'

export function requireAuthSecret(): string {
  const secret = env().BETTER_AUTH_SECRET
  if (secret) return secret
  if (env().isProduction) throw new Error('BETTER_AUTH_SECRET is required in production')
  return 'dev-only-insecure-secret-dev-only-insecure-secret'
}

/** better-auth's limiter stored in our Postgres rate_limit_buckets, shared by all instances (docs/blueprint/16 §4). */
export function rateLimitOptions(audience: Audience): BetterAuthOptions['rateLimit'] {
  return {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 15 * 60, max: 20 },
      '/request-password-reset': { window: 60 * 60, max: 10 },
      '/forget-password': { window: 60 * 60, max: 10 },
      '/sign-in/social': { window: 15 * 60, max: 20 },
      '/send-verification-email': { window: 60 * 60, max: 10 }
    },
    customStorage: {
      consume: async (key, rule) => {
        const result = await consumeRateLimit(`ba:${audience}:${key}`, rule.max, rule.window * 1000)
        return { allowed: result.allowed, retryAfter: result.allowed ? null : result.retryAfterSeconds }
      }
    }
  }
}

export function advancedOptions(cookiePrefix: string): BetterAuthOptions['advanced'] {
  return {
    cookiePrefix,
    useSecureCookies: env().isProduction,
    database: { generateId: () => uuidv7() },
    backgroundTasks: { handler: deferInScope },
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'] }
  }
}

function headerIp(headers: Headers | undefined): string | null {
  if (!headers) return null
  return headers.get('cf-connecting-ip') || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
}

/** Per-email sign-in limit + audit rows (docs/blueprint/03 §8). */
export function signInHooks(audience: Audience): Pick<BetterAuthOptions, 'hooks'> {
  const scope = `login:${audience}`
  return {
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email') return
        const email = normalizeEmail(String((ctx.body as { email?: string } | undefined)?.email ?? ''))
        if (!email) return
        const byEmail = await consumeRateLimit(`${scope}:${email}`, 5, 15 * 60 * 1000)
        if (!byEmail.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', { message: 'Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.', code: 'RATE_LIMITED' })
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email') return
        const email = normalizeEmail(String((ctx.body as { email?: string } | undefined)?.email ?? ''))
        const core = baseContext({ ip: headerIp(ctx.headers), userAgent: ctx.headers?.get('user-agent') ?? null })
        const session = ctx.context.newSession
        if (session) {
          await resetRateLimit(`${scope}:${email}`)
          await recordAudit(core, {
            audience, action: 'auth.sign_in',
            actorId: audience === 'staff' ? session.user.id : null,
            actorName: session.user.name,
            metadata: { userId: session.user.id, ip: core.ip, userAgent: core.userAgent }
          })
        } else {
          await recordAudit(core, { audience, action: 'auth.sign_in_failed', metadata: { email, ip: core.ip } })
        }
      })
    }
  }
}

export function unauthorized(): APIError {
  return new APIError('UNAUTHORIZED', { message: INVALID_CREDENTIALS, code: 'INVALID_EMAIL_OR_PASSWORD' })
}
