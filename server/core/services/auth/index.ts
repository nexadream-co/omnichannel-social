import { serializeCookie, serializeSignedCookie } from 'better-call'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { accounts, sessions, staffSessions, users } from '../../db/schema'
import { env } from '../../env'
import type { SignUpPort } from '../../registration'
import { creatorAuth } from './creator'
import { staffAuth } from './staff'
import type { Audience, SessionInfo } from './types'

export type { Audience, AuthUserBase, SessionInfo } from './types'

const IMPERSONATION_TTL_MS = 60 * 60_000
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
  // Impersonation lasts one hour from its start, whatever the sliding refresh did to expiresAt.
  if (session.impersonatedBy && Date.now() - new Date(session.createdAt).getTime() > IMPERSONATION_TTL_MS) {
    await revokeSession(session.id, audience)
    return null
  }
  return {
    sessionId: session.id,
    userId: session.userId,
    audience,
    activeWorkspaceId: session.activeWorkspaceId ?? null,
    impersonatedBy: session.impersonatedBy ?? null,
    expiresAt: session.impersonatedBy ? new Date(new Date(session.createdAt).getTime() + IMPERSONATION_TTL_MS) : new Date(session.expiresAt)
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

/** A Google-only account creates its first password without an old one (docs/blueprint/03 §6). */
export async function setInitialPassword(headers: Headers, newPassword: string): Promise<void> {
  if (await creatorAuth().api.getSession({ headers }).then(r => r && hasPassword(r.user.id))) {
    throw new Error('Account already has a password')
  }
  await creatorAuth().api.setPassword({ body: { newPassword }, headers })
}

export async function hashPassword(password: string): Promise<string> {
  const { hashPassword: hash } = await import('better-auth/crypto')
  return hash(password)
}

/**
 * Support impersonation (docs/blueprint/09 §3.2): a short creator session marked impersonatedBy, so the
 * console shows a banner, billing is read-only and actions are audited. Returns the Set-Cookie header.
 */
export async function createImpersonationSession(userId: string, workspaceId: string, staffUserId: string): Promise<{ setCookie: string, sessionId: string }> {
  const ctx = await creatorAuth().$context
  const session = await ctx.internalAdapter.createSession(userId, true, {
    impersonatedBy: staffUserId, activeWorkspaceId: workspaceId, expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS)
  } as Record<string, unknown>, true) // overrideAll: otherwise the defaults replace expiresAt and the extra fields
  if (!session) throw new Error('impersonation session not created')
  const cookie = ctx.authCookies.sessionToken
  const setCookie = await serializeSignedCookie(cookie.name, session.token, ctx.secret, { ...cookie.attributes, maxAge: IMPERSONATION_TTL_MS / 1000 })
  return { setCookie, sessionId: session.id }
}

/** The creator session cookie, expired: what "Berhenti menyamar" sends back. */
export async function clearedCreatorSessionCookie(): Promise<string> {
  const ctx = await creatorAuth().$context
  const cookie = ctx.authCookies.sessionToken
  return serializeCookie(cookie.name, '', { ...cookie.attributes, maxAge: 0 })
}

export const STAFF_RETURN_COOKIE = 'socialz_staff_return'

/**
 * Staff-to-staff impersonation (docs/blueprint/03 §10): a one-hour staff session marked impersonatedBy.
 * The operator's own signed session cookie is parked verbatim in an HttpOnly return cookie and restored on stop.
 */
export async function createStaffImpersonationSession(targetStaffId: string, impersonatorStaffId: string, currentCookieHeader: string): Promise<{ setCookies: string[], sessionId: string }> {
  const ctx = await staffAuth().$context
  const cookie = ctx.authCookies.sessionToken
  const current = currentCookieHeader.split(/;\s*/).find(part => part.startsWith(`${cookie.name}=`))?.slice(cookie.name.length + 1)
  if (!current) throw new Error('no staff session cookie to return to')
  const session = await ctx.internalAdapter.createSession(targetStaffId, true, {
    impersonatedBy: impersonatorStaffId, expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS)
  } as Record<string, unknown>, true)
  if (!session) throw new Error('impersonation session not created')
  const maxAge = IMPERSONATION_TTL_MS / 1000
  return {
    sessionId: session.id,
    setCookies: [
      await serializeSignedCookie(cookie.name, session.token, ctx.secret, { ...cookie.attributes, maxAge }),
      serializeCookie(STAFF_RETURN_COOKIE, decodeURIComponent(current), { httpOnly: true, secure: cookie.attributes.secure, sameSite: 'lax', path: '/', maxAge })
    ]
  }
}

/** Stop: the operator's parked cookie goes back on the staff session name; the return cookie is cleared. */
export async function restoreStaffSessionCookies(currentCookieHeader: string): Promise<string[]> {
  const ctx = await staffAuth().$context
  const cookie = ctx.authCookies.sessionToken
  const parked = currentCookieHeader.split(/;\s*/).find(part => part.startsWith(`${STAFF_RETURN_COOKIE}=`))?.slice(STAFF_RETURN_COOKIE.length + 1)
  return [
    parked ? serializeCookie(cookie.name, decodeURIComponent(parked), { ...cookie.attributes }) : serializeCookie(cookie.name, '', { ...cookie.attributes, maxAge: 0 }),
    serializeCookie(STAFF_RETURN_COOKIE, '', { path: '/', maxAge: 0 })
  ]
}

/** Auth endpoints an impersonated session may never call: credentials and identity stay with their owner. */
export const IMPERSONATION_BLOCKED_AUTH_PATHS = ['/change-password', '/change-email', '/set-password', '/delete-user', '/revoke-sessions', '/revoke-other-sessions']
