import { boolean, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './_shared'

// better-auth "creator" instance tables. Not the social accounts creators connect (those are social_accounts).
export const users = pgTable('users', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  phone: text().unique(),
  isActive: boolean().notNull().default(true),
  locale: text().notNull().default('id'),
  lastLoginAt: tstz(),
  lastSeenAt: tstz(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.isActive)])

export const sessions = pgTable('sessions', {
  id: id(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  expiresAt: tstz().notNull(),
  ipAddress: text(), userAgent: text(),
  activeWorkspaceId: text(),
  impersonatedBy: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.userId), index().on(t.expiresAt)])

export const accounts = pgTable('accounts', {
  id: id(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text().notNull(),
  accountId: text().notNull(),
  password: text(),
  accessToken: text(), refreshToken: text(), idToken: text(),
  accessTokenExpiresAt: tstz(),
  refreshTokenExpiresAt: tstz(),
  scope: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [uniqueIndex().on(t.providerId, t.accountId), index().on(t.userId)])

export const verifications = pgTable('verifications', {
  id: id(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: tstz().notNull(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.identifier), index().on(t.expiresAt)])
