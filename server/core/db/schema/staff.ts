import { boolean, index, integer, pgTable, primaryKey, text, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './_shared'

export const roles = pgTable('roles', {
  id: text().primaryKey(), // deterministic: role-{slug}
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  isSuperAdmin: boolean().notNull().default(false),
  isSystem: boolean().notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt()
})

export const staffUsers = pgTable('staff_users', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  phone: text(),
  isActive: boolean().notNull().default(true),
  roleId: text().notNull().references(() => roles.id),
  lastLoginAt: tstz(),
  lastSeenAt: tstz(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.roleId), index().on(t.isActive)])

// better-auth core tables for the staff instance
export const staffSessions = pgTable('staff_sessions', {
  id: id(),
  userId: text().notNull().references(() => staffUsers.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  expiresAt: tstz().notNull(),
  ipAddress: text(), userAgent: text(),
  impersonatedBy: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.userId), index().on(t.expiresAt)])

export const staffAccounts = pgTable('staff_accounts', {
  id: id(),
  userId: text().notNull().references(() => staffUsers.id, { onDelete: 'cascade' }),
  providerId: text().notNull(),
  accountId: text().notNull(),
  password: text(),
  accessToken: text(), refreshToken: text(), idToken: text(),
  accessTokenExpiresAt: tstz(),
  refreshTokenExpiresAt: tstz(),
  scope: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.userId)])

export const staffVerifications = pgTable('staff_verifications', {
  id: id(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: tstz().notNull(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.identifier), index().on(t.expiresAt)])

export const permissions = pgTable('permissions', {
  id: id(),
  key: text().notNull().unique(),
  group: text().notNull(),
  description: text().notNull(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.group)])

export const rolePermissions = pgTable('role_permissions', {
  roleId: text().notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: text().notNull().references(() => permissions.id, { onDelete: 'cascade' })
}, t => [primaryKey({ columns: [t.roleId, t.permissionId] }), index().on(t.permissionId)])

/** Self-referential /admin sidebar. parentId null && path null = section header. Max depth 3. */
export const menus = pgTable('menus', {
  id: text().primaryKey(), // deterministic: menu-{slug}
  parentId: text().references((): AnyPgColumn => menus.id, { onDelete: 'cascade' }),
  label: text().notNull(),
  slug: text().notNull().unique(),
  path: text(), icon: text(), permissionKey: text(),
  order: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.parentId), index().on(t.order)])

export const staffInvitations = pgTable('staff_invitations', {
  id: id(),
  email: text().notNull(), name: text(),
  roleId: text().notNull().references(() => roles.id),
  tokenHash: text().notNull().unique(),
  invitedById: text().references(() => staffUsers.id),
  expiresAt: tstz().notNull(),
  acceptedAt: tstz(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.email), index().on(t.roleId)])
