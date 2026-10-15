import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { accounts, sessions, staffSessions, users } from '../../db/schema'
import { env } from '../../env'
import type { SignUpPort } from '../../registration'
import { creatorAuth } from './creator'
import { staffAuth } from './staff'
import type { Audience, SessionInfo } from './types'

export type { Audience, AuthUserBase, SessionInfo } from './types'
export { CREATOR_BASE_PATH } from './creator'
export { STAFF_BASE_PATH } from './staff'

/**
 * The auth facade: the ONLY import site for business code (docs/blueprint/03 §2).
 * Nothing outside services/auth knows better-auth is underneath.
 */
export function handleAuthRequest(audience: Audience, request: Request): Promise<Response> {
  return audience === 'creator' ? creatorAuth().handler(request) : staffAuth().handler(request)
}

export async function readSession(headers: Headers, audience: Audience): Promise<SessionInfo | null> {
  const result = audience === 'creator'
    ? await creatorAuth().api.getSession({ headers })
    : await staffAuth().api.getSession({ headers })
  if (!result) return null
  const session = result.session as typeof result.session & { activeWorkspaceId?: string | null, impersonatedBy?: string | null }
  return {
    sessionId: session.id,
    userId: session.userId,
    audience,
    activeWorkspaceId: session.activeWorkspaceId ?? null,
    impersonatedBy: session.impersonatedBy ?? null,
    expiresAt: new Date(session.expiresAt)
  }
}

export async function setActiveWorkspace(sessionId: string, workspaceId: string): Promise<void> {
  await getDb().update(sessions).set({ activeWorkspaceId: workspaceId }).where(eq(sessions.id, sessionId))
}

export async function revokeSession(sessionId: string, audience: Audience): Promise<void> {
  const table = audience === 'creator' ? sessions : staffSessions
  await getDb().delete(table).where(eq(table.id, sessionId))
}

export async function revokeAllSessions(userId: string, audience: Audience): Promise<void> {
  const table = audience === 'creator' ? sessions : staffSessions
  await getDb().delete(table).where(eq(table.userId, userId))
}

export async function hasPassword(userId: string): Promise<boolean> {
  const rows = await getDb().select({ password: accounts.password }).from(accounts).where(eq(accounts.userId, userId))
  return rows.some(row => Boolean(row.password))
}

export function availableSocialProviders(): ('google')[] {
  return env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET ? ['google'] : []
}

/** Server-side email sign-up for registerCreator(); returns the Set-Cookie headers of the new session. */
export const creatorSignUp: SignUpPort = {
  async signUp(input, headers) {
    const { headers: responseHeaders, response } = await creatorAuth().api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
      headers,
      returnHeaders: true
    })
    return { userId: response.user.id, setCookie: responseHeaders.getSetCookie() }
  },
  async deleteUser(userId) {
    await getDb().delete(users).where(eq(users.id, userId))
  }
}

export async function hashPassword(password: string): Promise<string> {
  const { hashPassword: hash } = await import('better-auth/crypto')
  return hash(password)
}
