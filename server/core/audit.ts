import type { CoreContext } from './context'
import { auditLogs } from './db/schema'

export interface AuditInput {
  audience: 'creator' | 'staff'
  action: string
  actorId?: string | null
  actorName?: string | null
  impersonatorId?: string | null
  workspaceId?: string | null
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

/** Never throws: an audit write must not fail the action it describes (docs/blueprint/16 §2). */
export async function recordAudit(ctx: Pick<CoreContext, 'db' | 'log' | 'ip' | 'userAgent'>, input: AuditInput): Promise<void> {
  try {
    await ctx.db.insert(auditLogs).values({
      ...input,
      ip: input.ip ?? ctx.ip ?? null,
      userAgent: input.userAgent ?? ctx.userAgent ?? null
    })
  } catch (error) {
    ctx.log.error('audit.write_failed', { action: input.action, error })
  }
}
