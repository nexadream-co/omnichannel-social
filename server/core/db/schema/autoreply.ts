import { sql } from 'drizzle-orm'
import { boolean, foreignKey, index, integer, pgEnum, pgTable, text, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, updatedAt } from './_shared'
import { socialAccounts } from './channels'
import { links } from './links'

export const dmRuleScope = pgEnum('dm_rule_scope', ['post', 'global'])
export const dmMatchMode = pgEnum('dm_match_mode', ['exact', 'contains'])
export const dmPausedReason = pgEnum('dm_paused_reason', ['plan_limit', 'kill_switch', 'account_disabled'])
export const dmEventStatus = pgEnum('dm_event_status', [
  'matched', 'dm_sent', 'replied', 'skipped', 'skipped_dup', 'skipped_expired', 'rate_limited', 'failed'
])

export const dmRules = pgTable('dm_rules', {
  id: id(),
  workspaceId: text().notNull(),
  socialAccountId: text().notNull(),
  name: text().notNull(),
  scope: dmRuleScope().notNull().default('global'),
  externalMediaId: text(),
  keywords: text().array().notNull().default(sql`'{}'::text[]`), // normalized
  matchMode: dmMatchMode().notNull().default('contains'),
  dmMessage: text().notNull(),
  linkId: text(),
  publicReplyVariants: text().array().notNull().default(sql`'{}'::text[]`),
  dailyCap: integer(),
  active: boolean().notNull().default(true),
  pausedReason: dmPausedReason(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  foreignKey({ columns: [t.workspaceId, t.socialAccountId], foreignColumns: [socialAccounts.workspaceId, socialAccounts.id] }),
  foreignKey({ columns: [t.workspaceId, t.linkId], foreignColumns: [links.workspaceId, links.id] }),
  index().on(t.socialAccountId, t.active)
])

export const dmEvents = pgTable('dm_events', {
  id: id(),
  workspaceId: text().notNull(),
  ruleId: text(),
  socialAccountId: text().notNull(),
  commentId: text().notNull(),
  commenterId: text().notNull(),
  commenterUsername: text(),
  mediaId: text(),
  commentText: text(), // purged after privacy.commentTextRetentionDays
  status: dmEventStatus().notNull().default('matched'),
  error: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  foreignKey({ columns: [t.workspaceId, t.ruleId], foreignColumns: [dmRules.workspaceId, dmRules.id] }),
  foreignKey({ columns: [t.workspaceId, t.socialAccountId], foreignColumns: [socialAccounts.workspaceId, socialAccounts.id] }),
  uniqueIndex().on(t.socialAccountId, t.commentId),
  uniqueIndex('dm_events_one_dm_per_commenter_idx').on(t.ruleId, t.commenterId).where(sql`${t.status} = 'dm_sent'`),
  index().on(t.workspaceId, t.createdAt)
])
