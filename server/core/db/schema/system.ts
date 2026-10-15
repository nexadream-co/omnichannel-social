import { boolean, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { authAudience, createdAt, id, tstz, updatedAt } from './_shared'
import { users } from './creators'
import { staffUsers } from './staff'
import { workspaces } from './tenancy'

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  audience: authAudience().notNull(),
  actorId: text(),
  actorName: text(),
  impersonatorId: text(),
  workspaceId: text().references(() => workspaces.id),
  action: text().notNull(),
  targetType: text(), targetId: text(),
  metadata: jsonb(),
  ip: text(), userAgent: text(),
  createdAt: createdAt()
}, t => [index().on(t.actorId), index().on(t.workspaceId), index().on(t.action), index().on(t.createdAt)])

export const notifications = pgTable('notifications', {
  id: id(),
  audience: authAudience().notNull(),
  staffUserId: text().references(() => staffUsers.id, { onDelete: 'cascade' }),
  userId: text().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: text().references(() => workspaces.id),
  templateKey: text(),
  dedupeKey: text(),
  title: text().notNull(),
  body: text().notNull(),
  actionUrl: text(), icon: text(),
  level: text().notNull().default('info'),
  readAt: tstz(),
  createdAt: createdAt()
}, t => [index().on(t.staffUserId, t.readAt), index().on(t.userId, t.readAt), index().on(t.workspaceId), index().on(t.createdAt)])

export const emailTemplates = pgTable('email_templates', {
  id: text().primaryKey(), // deterministic: email-{key}
  key: text().notNull().unique(),
  name: text().notNull(),
  subject: text().notNull(),
  body: text().notNull(),
  description: text(),
  variables: jsonb().notNull(),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
})

export const notificationTemplates = pgTable('notification_templates', {
  id: text().primaryKey(), // deterministic: notif-{key}
  key: text().notNull().unique(),
  name: text().notNull(),
  title: text().notNull(), body: text().notNull(),
  actionLabel: text(), actionUrl: text(), icon: text(),
  level: text().notNull().default('info'),
  variables: jsonb().notNull(),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
})

/** Fixed-window counters shared by every function instance. Created UNLOGGED in the migration SQL. */
export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  key: text().notNull(),
  windowStart: tstz().notNull(),
  count: integer().notNull().default(0),
  expiresAt: tstz().notNull()
}, t => [primaryKey({ columns: [t.key, t.windowStart] }), index().on(t.expiresAt)])
