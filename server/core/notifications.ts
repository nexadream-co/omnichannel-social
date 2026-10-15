import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { NOTIFICATION_TEMPLATES, renderTemplateString } from '../../shared/utils/templates'
import type { CoreContext } from './context'
import type { Executor } from './db/client'
import { notifications, notificationTemplates, permissions, rolePermissions, roles, staffUsers, users, workspaceMembers } from './db/schema'
import { sendTemplatedEmail } from './email'
import { appError } from './errors'
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

  // Check + insert under a per-(recipient, dedupeKey) lock, so concurrent jobs can't both pass the check.
  const write = async (exec: Executor): Promise<boolean> => {
    if (input.dedupeKey) {
      await exec.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification:${input.staffUserId ?? input.userId}:${input.dedupeKey}`}))`)
      const recipient = input.audience === 'staff' ? eq(notifications.staffUserId, input.staffUserId!) : eq(notifications.userId, input.userId!)
      const existing = await exec.select({ id: notifications.id }).from(notifications)
        .where(and(recipient, eq(notifications.dedupeKey, input.dedupeKey), isNull(notifications.readAt))).limit(1)
      if (existing.length) return false
    }
    if (input.channels?.database !== false) {
      await exec.insert(notifications).values({
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
    return true
  }
  const written = tx ? await write(tx) : input.dedupeKey ? await ctx.db.transaction(write) : await write(ctx.db)
  if (!written) return

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

/** Owners of the workspace; operational templates (post_failed …) also reach active editors (docs/blueprint/11 §2). */
export async function notifyWorkspaceOwners(ctx: Ctx, workspaceId: string, input: Omit<CreateNotificationInput, 'audience' | 'userId' | 'workspaceId'>, options: { includeEditors?: boolean } = {}) {
  try {
    const roles = options.includeEditors ? ['owner', 'editor'] as const : ['owner'] as const
    const members = await ctx.db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.isActive, true), inArray(workspaceMembers.role, [...roles])))
    for (const member of members) await createNotification(ctx, { ...input, audience: 'creator', userId: member.userId, workspaceId })
  } catch (error) {
    ctx.log.error('notify_owners.failed', { workspaceId, error })
  }
}

export interface NotificationRecipient {
  audience: 'creator' | 'staff'
  userId: string
  workspaceId?: string | null
}

function recipientFilter(recipient: NotificationRecipient) {
  return recipient.audience === 'staff'
    ? and(eq(notifications.audience, 'staff'), eq(notifications.staffUserId, recipient.userId))
    : and(eq(notifications.audience, 'creator'), eq(notifications.userId, recipient.userId), recipient.workspaceId ? eq(notifications.workspaceId, recipient.workspaceId) : undefined)
}

/**
 * One implementation behind both bells and both notification pages (docs/blueprint/11 §2).
 * unreadCount counts everything addressed to the recipient, never just the filtered page.
 */
export async function listNotifications(db: Executor, recipient: NotificationRecipient, query: { page: number, limit: number, offset: number, search: string, unreadOnly?: boolean }) {
  const base = recipientFilter(recipient)
  const filters = and(
    base,
    query.unreadOnly ? isNull(notifications.readAt) : undefined,
    query.search ? or(ilike(notifications.title, `%${query.search}%`), ilike(notifications.body, `%${query.search}%`)) : undefined
  )
  const [items, [total], [unread]] = await Promise.all([
    db.select({
      id: notifications.id, title: notifications.title, body: notifications.body, actionUrl: notifications.actionUrl,
      icon: notifications.icon, level: notifications.level, readAt: notifications.readAt, createdAt: notifications.createdAt
    }).from(notifications).where(filters).orderBy(desc(notifications.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ n: count() }).from(notifications).where(filters),
    db.select({ n: count() }).from(notifications).where(and(base, isNull(notifications.readAt)))
  ])
  const totalCount = total?.n ?? 0
  return {
    items,
    meta: { page: query.page, limit: query.limit, total: totalCount, pageCount: Math.max(1, Math.ceil(totalCount / query.limit)) },
    unreadCount: unread?.n ?? 0
  }
}

/** 404 for someone else's notification (never reveal it exists). */
export async function markNotificationRead(db: Executor, recipient: NotificationRecipient, id: string): Promise<void> {
  const rows = await db.update(notifications).set({ readAt: new Date() })
    .where(and(recipientFilter(recipient), eq(notifications.id, id)))
    .returning({ id: notifications.id })
  if (!rows.length) throw appError(404, 'Notifikasi tidak ditemukan.', 'NOT_FOUND')
}

export async function markAllNotificationsRead(db: Executor, recipient: NotificationRecipient): Promise<number> {
  const rows = await db.update(notifications).set({ readAt: new Date() })
    .where(and(recipientFilter(recipient), isNull(notifications.readAt)))
    .returning({ id: notifications.id })
  return rows.length
}
