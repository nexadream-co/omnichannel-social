import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq } from 'drizzle-orm'
import { baseContext } from '../../context'
import { getDb } from '../../db/client'
import { staffAccounts, staffSessions, staffUsers, staffVerifications } from '../../db/schema'
import { sendTemplatedEmail } from '../../email'
import { env } from '../../env'
import { advancedOptions, rateLimitOptions, requireAuthSecret, signInHooks, unauthorized } from './shared'

export const STAFF_BASE_PATH = '/api/admin/auth'

function createStaffAuth() {
  const config = env()
  return betterAuth({
    appName: 'Socialz.id Admin',
    baseURL: config.siteUrl,
    basePath: STAFF_BASE_PATH,
    secret: requireAuthSecret(),
    trustedOrigins: [config.siteOrigin],
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: { user: staffUsers, session: staffSessions, account: staffAccounts, verification: staffVerifications }
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // staff accounts are created by invitation only
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 2 * 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await sendTemplatedEmail(baseContext(), 'password_reset', user.email, {
          name: user.name,
          resetUrl: `${config.siteUrl}/admin/auth/reset-password?token=${encodeURIComponent(token)}`,
          expiresInHours: 2
        })
      }
    },
    user: {
      additionalFields: {
        roleId: { type: 'string', required: true, input: false },
        phone: { type: 'string', required: false, input: false },
        isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
        lastLoginAt: { type: 'date', required: false, input: false },
        lastSeenAt: { type: 'date', required: false, input: false }
      }
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      additionalFields: {
        impersonatedBy: { type: 'string', required: false, input: false }
      }
    },
    advanced: advancedOptions('socialz_staff'),
    rateLimit: rateLimitOptions('staff'),
    onAPIError: { errorURL: `${config.siteUrl}/admin/auth/login` },
    ...signInHooks('staff'),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [user] = await getDb().select({ isActive: staffUsers.isActive }).from(staffUsers).where(eq(staffUsers.id, session.userId)).limit(1)
            if (!user?.isActive) throw unauthorized()
          },
          after: async (session) => {
            if (session.impersonatedBy) return
            await getDb().update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, session.userId))
          }
        }
      }
    }
  })
}

export type StaffAuth = ReturnType<typeof createStaffAuth>

const key = Symbol.for('socialz.auth.staff')
type G = typeof globalThis & { [key]?: StaffAuth }

export function staffAuth(): StaffAuth {
  const g = globalThis as G
  g[key] ??= createStaffAuth()
  return g[key]!
}
