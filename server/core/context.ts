import type { WorkspaceAbility, WorkspaceRoleSlug } from '../../shared/utils/workspace-abilities'
import { canWorkspaceRole } from '../../shared/utils/workspace-abilities'
import type { Executor } from './db/client'
import { getDb } from './db/client'
import { appError } from './errors'
import { createLogger, type Logger } from './log'

/**
 * Every core function receives a context, never an H3Event (docs/blueprint/01 §4).
 * `defer` is after-response work: event.waitUntil in requests, awaited in jobs and scripts.
 */
export interface CoreContext {
  db: Executor
  log: Logger
  defer: (work: Promise<unknown>) => void
  requestId?: string
  ip?: string | null
  userAgent?: string | null
}

export interface WorkspaceContext extends CoreContext {
  workspaceId: string
  userId: string | null
  role: WorkspaceRoleSlug | 'system'
  impersonatorId: string | null
}

export interface StaffContext extends CoreContext {
  staffUserId: string
  staffName: string
  permissions: Set<string>
  isSuperAdmin: boolean
  impersonatorId: string | null
}

/** A defer that tracks promises so jobs, scripts and tests can await them all. */
export function trackingDefer(log: Logger = createLogger()) {
  const pending: Promise<unknown>[] = []
  return {
    defer: (work: Promise<unknown>) => {
      pending.push(work.catch(error => log.error('defer.failed', { error })))
    },
    flush: async () => {
      while (pending.length) await Promise.all(pending.splice(0))
    }
  }
}

export function baseContext(overrides: Partial<CoreContext> = {}): CoreContext {
  const log = overrides.log ?? createLogger()
  return {
    db: getDb(),
    log,
    defer: work => void work.catch(error => log.error('defer.failed', { error })),
    ...overrides
  }
}

/** Job handlers only: role 'system' passes ability checks but never plan checks. */
export function systemContext(workspaceId: string, base: CoreContext): WorkspaceContext {
  return { ...base, workspaceId, userId: null, role: 'system', impersonatorId: null }
}

export function assertAbility(ctx: Pick<WorkspaceContext, 'role'>, ability: WorkspaceAbility): void {
  if (!canWorkspaceRole(ctx.role, ability)) {
    throw appError(403, 'Kamu tidak punya akses untuk tindakan ini. Hubungi pemilik akun.', 'FORBIDDEN', { ability })
  }
}

export function assertPermission(ctx: Pick<StaffContext, 'permissions' | 'isSuperAdmin'>, key: string): void {
  if (!ctx.isSuperAdmin && !ctx.permissions.has(key)) {
    throw appError(403, 'Kamu tidak punya akses untuk tindakan ini.', 'FORBIDDEN', { permission: key })
  }
}
