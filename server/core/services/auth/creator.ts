import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { and, asc, eq } from 'drizzle-orm'
import { baseContext } from '../../context'
import { getDb } from '../../db/client'
import { accounts, sessions, users, verifications, workspaceMembers } from '../../db/schema'
import { sendTemplatedEmail } from '../../email'
import { env } from '../../env'
import { afterWorkspaceProvisioned, provisionWorkspace } from '../../registration'
import { advancedOptions, rateLimitOptions, requireAuthSecret, signInHooks, unauthorized } from './shared'

export const CREATOR_BASE_PATH = '/api/app/auth'

function createCreatorAuth() {
  const config = env()
  const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
  return betterAuth({
    appName: 'Socialz.id',
    baseURL: config.siteUrl,
    basePath: CREATOR_BASE_PATH,
    secret: requireAuthSecret(),
    trustedOrigins: [config.siteOrigin],
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications }
    }),
    // Public sign-up goes through POST /api/app/register (terms, registration switch, workspace). Server-side api calls still work.
    disabledPaths: ['/sign-up/email'],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 2 * 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await sendTemplatedEmail(baseContext(), 'password_reset', user.email, {
          name: user.name,
          resetUrl: `${config.siteUrl}/app/auth/reset-password?token=${encodeURIComponent(token)}`,
          expiresInHours: 2
        })
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, token }) => {
        // Invitees are verified by the invitation link itself; don't send them a second email.
        const [current] = await getDb().select({ verified: users.emailVerified }).from(users).where(eq(users.id, user.id)).limit(1)
        if (current?.verified) return
        await sendTemplatedEmail(baseContext(), 'verify_email', user.email, {
          name: user.name,
          verifyUrl: `${config.siteUrl}/app/auth/verify-email?token=${encodeURIComponent(token)}`,
          expiresInHours: 24
        })
      }
    },
    socialProviders: googleEnabled
      ? { google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET, prompt: 'select_account' } }
      : {},
    account: {
      accountLinking: { enabled: true, trustedProviders: ['google'], allowDifferentEmails: false }
    },
    user: {
      additionalFields: {
        phone: { type: 'string', required: false, input: false },
        isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
        locale: { type: 'string', required: false, defaultValue: 'id', input: false },
        lastLoginAt: { type: 'date', required: false, input: false },
        lastSeenAt: { type: 'date', required: false, input: false }
      }
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      additionalFields: {
        activeWorkspaceId: { type: 'string', required: false, input: false },
        impersonatedBy: { type: 'string', required: false, input: false }
      }
    },
    advanced: advancedOptions('socialz'),
    rateLimit: rateLimitOptions('creator'),
    onAPIError: { errorURL: `${config.siteUrl}/app/auth/login` },
    ...signInHooks('creator'),
    databaseHooks: {
      user: {
        create: {
          after: async (user, ctx) => {
            // Email sign-up is provisioned by registerCreator() with the form's timezone; every other path
            // (Google) is provisioned here, so every creator always has a workspace (docs/blueprint/03 §5).
            if (ctx?.path === '/sign-up/email') return
            const core = baseContext()
            const input = { name: user.name, email: user.email, viaOAuth: true }
            const result = await provisionWorkspace(core, user.id, input)
            await afterWorkspaceProvisioned(core, user.id, input, result)
          }
        }
      },
      session: {
        create: {
          before: async (session) => {
            const db = getDb()
            const [user] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, session.userId)).limit(1)
            if (!user?.isActive) throw unauthorized()
            if (session.activeWorkspaceId) return
            const [membership] = await db.select({ workspaceId: workspaceMembers.workspaceId }).from(workspaceMembers)
              .where(and(eq(workspaceMembers.userId, session.userId), eq(workspaceMembers.isActive, true)))
              .orderBy(asc(workspaceMembers.createdAt)).limit(1)
            return { data: { ...session, activeWorkspaceId: membership?.workspaceId ?? null } }
          },
          after: async (session) => {
            if (session.impersonatedBy) return
            await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, session.userId))
          }
        }
      }
    }
  })
}

export type CreatorAuth = ReturnType<typeof createCreatorAuth>

const key = Symbol.for('socialz.auth.creator')
type G = typeof globalThis & { [key]?: CreatorAuth }

/** Lazily created per function instance (the db pool is lazy too). */
export function creatorAuth(): CreatorAuth {
  const g = globalThis as G
  g[key] ??= createCreatorAuth()
  return g[key]!
}
