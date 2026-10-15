import type { H3Event } from 'h3'
import type { PermissionKey } from '../../shared/utils/permissions'
import { resolveCreatorAccess, resolveStaffAccess, touchLastSeen, type CreatorAccess, type StaffAccess } from '../core/access'
import type { StaffContext, WorkspaceContext } from '../core/context'
import { appError } from '../core/errors'
import { readSession, setActiveWorkspace, type SessionInfo } from '../core/services/auth'
import { requestContext } from './context'

const unauthenticated = () => appError(401, 'Sesi kamu sudah berakhir. Silakan masuk lagi.', 'UNAUTHENTICATED')

function headersOf(event: H3Event): Headers {
  return new Headers(getRequestHeaders(event) as Record<string, string>)
}

export async function tryGetCreatorSession(event: H3Event): Promise<SessionInfo | null> {
  return readSession(headersOf(event), 'creator')
}

/** 401 → session, for routes that work before a workspace is known. */
export async function requireCreatorSession(event: H3Event): Promise<SessionInfo> {
  const session = await tryGetCreatorSession(event)
  if (!session) throw unauthenticated()
  return session
}

export type CreatorRequestContext = WorkspaceContext & { access: CreatorAccess, session: SessionInfo }

/** docs/blueprint/03 §3: session → active user → active membership → workspace not deleted/suspended → plan. */
export async function requireWorkspaceContext(event: H3Event): Promise<CreatorRequestContext> {
  if (event.context.workspaceContext) return event.context.workspaceContext as CreatorRequestContext
  const base = requestContext(event)
  const session = await requireCreatorSession(event)
  const access = await resolveCreatorAccess(base.db, session)
  if (access.sessionNeedsWorkspace) await setActiveWorkspace(session.sessionId, access.workspace.id)
  const ctx: CreatorRequestContext = {
    ...base,
    log: base.log.child({ workspaceId: access.workspace.id }),
    workspaceId: access.workspace.id,
    userId: access.user.id,
    role: access.membership.role,
    impersonatorId: session.impersonatedBy,
    access,
    session
  }
  event.context.workspaceContext = ctx
  if (!session.impersonatedBy) base.defer(touchLastSeen(base.db, 'creator', access.user.id))
  return ctx
}

export type StaffRequestContext = StaffContext & { access: StaffAccess, session: SessionInfo }

export async function requireStaffContext(event: H3Event): Promise<StaffRequestContext> {
  if (event.context.staffContext) return event.context.staffContext as StaffRequestContext
  const base = requestContext(event)
  const session = await readSession(headersOf(event), 'staff')
  if (!session) throw appError(401, 'Sesi Anda sudah berakhir. Silakan masuk lagi.', 'UNAUTHENTICATED')
  const access = await resolveStaffAccess(base.db, session)
  const ctx: StaffRequestContext = {
    ...base,
    log: base.log.child({ staffUserId: access.user.id }),
    staffUserId: access.user.id,
    staffName: access.user.name,
    permissions: access.permissions,
    isSuperAdmin: access.role.isSuperAdmin,
    impersonatorId: session.impersonatedBy,
    access,
    session
  }
  event.context.staffContext = ctx
  if (!session.impersonatedBy) base.defer(touchLastSeen(base.db, 'staff', access.user.id))
  return ctx
}

/** 403 unless the staff role holds the permission; superadmin bypasses. */
export async function requirePermission(event: H3Event, key: PermissionKey): Promise<StaffRequestContext> {
  const ctx = await requireStaffContext(event)
  if (!ctx.isSuperAdmin && !ctx.permissions.has(key)) {
    throw appError(403, 'Anda tidak punya akses untuk tindakan ini.', 'FORBIDDEN', { permission: key })
  }
  return ctx
}

export async function requireSuperAdmin(event: H3Event): Promise<StaffRequestContext> {
  const ctx = await requireStaffContext(event)
  if (!ctx.isSuperAdmin) throw appError(403, 'Hanya superadmin yang bisa melakukan ini.', 'FORBIDDEN')
  return ctx
}

export function requireNotImpersonating(ctx: { impersonatorId: string | null }): void {
  if (ctx.impersonatorId) throw appError(403, 'Tindakan ini tidak bisa dilakukan saat menyamar sebagai pengguna.', 'FORBIDDEN')
}
