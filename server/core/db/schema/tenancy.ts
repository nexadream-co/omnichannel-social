import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt, workspaceRole, workspaceStatus } from './_shared'
import { users } from './creators'

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  timezone: text().notNull().default('Asia/Jakarta'),
  status: workspaceStatus().notNull().default('active'),
  suspendedAt: tstz(),
  suspendedReason: text(),
  dataConsentAcceptedAt: tstz(),
  onboardingCompletedAt: tstz(),
  downgradeResolvedAt: tstz(),
  entitlementsVersion: integer().notNull().default(0), // bumped by invalidateEntitlements(); part of the cache key
  deletedAt: tstz(),
  deleteRequestedAt: tstz(),
  niche: text(),
  affiliatePrograms: text().array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.status), index().on(t.deletedAt), index().on(t.createdAt)])

export const workspaceMembers = pgTable('workspace_members', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: workspaceRole().notNull().default('owner'),
  isActive: boolean().notNull().default(true),
  invitedById: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [uniqueIndex().on(t.workspaceId, t.userId), index().on(t.userId), index().on(t.workspaceId)])

export const workspaceInvitations = pgTable('workspace_invitations', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text().notNull(), name: text(),
  role: workspaceRole().notNull().default('editor'),
  tokenHash: text().notNull().unique(),
  invitedById: text(),
  expiresAt: tstz().notNull(),
  acceptedAt: tstz(),
  revokedAt: tstz(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [uniqueIndex().on(t.workspaceId, t.email), index().on(t.workspaceId), index().on(t.email)])

/** One trial per normalized email address. */
export const trialClaims = pgTable('trial_claims', {
  id: id(),
  emailNormalized: text().notNull().unique(),
  workspaceId: text().notNull().unique().references(() => workspaces.id),
  createdAt: createdAt()
})
