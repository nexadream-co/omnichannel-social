import { and, eq, inArray, isNull } from 'drizzle-orm'
import { NOTIFICATION_TEMPLATES, renderTemplateString } from '../../shared/utils/templates'
import type { CoreContext } from './context'
import type { Executor } from './db/client'
import { notifications, notificationTemplates, permissions, rolePermissions, roles, staffUsers, users } from './db/schema'
import { sendTemplatedEmail } from './email'
import { getSetting } from './settings'

export interface CreateNotificationInput {
  audience: 'creator' | 'staff'
  userId?: string
  staffUserId?: string
  workspaceId?: string
  templateKey?: string
  variables?: Record<string, unknown>
  title?: string
  body?: string
  actionUrl?: string
  icon?: string
  level?: 'info' | 'success' | 'warning' | 'error'
  dedupeKey?: string
  channels?: { database?: boolean, email?: boolean }
}

type Ctx = Pick<CoreContext, 'db' | 'log' | 'defer'>

/** DB row when active, else code catalog (docs/blueprint/11 §3). */
async function resolveTemplate(db: Executor, key: string) {
  const [row] = await db.select().from(notificationTemplates).where(eq(notificationTemplates.key, key)).limit(1)
  if (row?.isActive) return row
  return NOTIFICATION_TEMPLATES.find(template => template.key === key) ?? null
}

/**
 * Writes the bell row (inside `tx` when given) and defers external channels until after commit.
 * A channel failure never bubbles into the business operation.
 */
export async function createNotification(ctx: Ctx, input: CreateNotificationInput, tx?: Executor): Promise<void> {
  const db = tx ?? ctx.db
  const template = input.templateKey ? await resolveTemplate(db, input.templateKey) : null
  const appName = await getSetting('company.name')
  const variables = { appName, ...input.variables }
  const title = input.title ?? (template ? renderTemplateString(template.title, variables) : undefined)
  if (!title) throw new Error(`Notification without title or known template: ${input.templateKey}`)
  const body = input.body ?? (template ? renderTemplateString(template.body, variables) : '')

  if (input.dedupeKey) {
    const recipient = input.audience === 'staff' ? eq(notifications.staffUserId, input.staffUserId!) : eq(notifications.userId, input.userId!)
    const existing = await db.select({ id: notifications.id }).from(notifications)
      .where(and(recipient, eq(notifications.dedupeKey, input.dedupeKey), isNull(notifications.readAt))).limit(1)
    if (existing.length) return
  }

  if (input.channels?.database !== false) {
    await db.insert(notifications).values({
      audience: input.audience,
      userId: input.userId ?? null,
      staffUserId: input.staffUserId ?? null,
      workspaceId: input.workspaceId ?? null,
      templateKey: input.templateKey ?? null,
      dedupeKey: input.dedupeKey ?? null,
      title,
      body,
      actionUrl: input.actionUrl ?? (template?.actionUrl ? renderTemplateString(template.actionUrl, variables) : null),
      icon: input.icon ?? template?.icon ?? null,
      level: input.level ?? template?.level ?? 'info'
    })
  }

  if (input.channels?.email === false || !input.templateKey) return
  const templateKey = input.templateKey
  ctx.defer((async () => {
    const recipient = input.audience === 'staff'
      ? (await ctx.db.select({ email: staffUsers.email, name: staffUsers.name }).from(staffUsers).where(eq(staffUsers.id, input.staffUserId!)))[0]
      : (await ctx.db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, input.userId!)))[0]
    if (!recipient) return
    await sendTemplatedEmail(ctx, templateKey, recipient.email, { name: recipient.name, ...input.variables })
  })())
}

/** Bell (and optional email) to every active staff member whose role holds the permission. */
export async function notifyStaff(ctx: Ctx, permissionKey: string, input: Omit<CreateNotificationInput, 'audience' | 'staffUserId'>): Promise<void> {
  try {
    const superRoles = await ctx.db.select({ id: roles.id }).from(roles).where(eq(roles.isSuperAdmin, true))
    const permitted = await ctx.db.select({ roleId: rolePermissions.roleId }).from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(permissions.key, permissionKey))
    const roleIds = [...new Set([...superRoles.map(r => r.id), ...permitted.map(r => r.roleId)])]
    if (!roleIds.length) return
    const recipients = await ctx.db.select({ id: staffUsers.id }).from(staffUsers)
      .where(and(eq(staffUsers.isActive, true), inArray(staffUsers.roleId, roleIds)))
    for (const recipient of recipients) {
      await createNotification(ctx, { ...input, audience: 'staff', staffUserId: recipient.id, channels: { email: false, ...input.channels } })
    }
  } catch (error) {
    ctx.log.error('notify_staff.failed', { permissionKey, error })
  }
}
