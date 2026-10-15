import { sql } from 'drizzle-orm'
import { bigint, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './_shared'
import { users } from './creators'
import { workspaces } from './tenancy'

export const platform = pgEnum('platform', ['instagram', 'threads', 'facebook', 'tiktok', 'youtube', 'x'])
export const socialAccountStatus = pgEnum('social_account_status', ['active', 'needs_reauth', 'revoked', 'disabled'])
export const mediaKind = pgEnum('media_kind', ['image', 'video'])
export const mediaStatus = pgEnum('media_status', ['uploading', 'processing', 'ready', 'failed'])
export const postStatus = pgEnum('post_status', ['draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled'])
export const postFormat = pgEnum('post_format', ['feed', 'carousel', 'reel', 'story', 'text'])
export const postTargetStatus = pgEnum('post_target_status', [
  'draft', 'scheduled', 'preparing', 'processing', 'publishing', 'published', 'publish_unknown',
  'retrying', 'quota_deferred', 'needs_reauth', 'failed', 'cancelled'
])

export const socialAccounts = pgTable('social_accounts', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  platform: platform().notNull(),
  externalId: text().notNull(),
  username: text(),
  avatarUrl: text(),
  accessTokenEnc: text(), // 'enc:v1:…' via server/core/crypto.ts, AAD = `${id}|${platform}`
  refreshTokenEnc: text(),
  tokenExpiresAt: tstz(),
  scopes: text().array().notNull().default(sql`'{}'::text[]`),
  status: socialAccountStatus().notNull().default('active'),
  meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  // One owner per platform account, so webhooks route unambiguously.
  uniqueIndex('social_accounts_platform_external_live_idx').on(t.platform, t.externalId).where(sql`${t.status} <> 'revoked'`),
  index('social_accounts_token_expiry_active_idx').on(t.tokenExpiresAt).where(sql`${t.status} = 'active'`),
  index().on(t.workspaceId)
])

export const mediaAssets = pgTable('media_assets', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  r2Key: text().notNull().unique(),
  publicUrl: text(),
  mime: text().notNull(),
  kind: mediaKind().notNull(),
  bytes: bigint({ mode: 'number' }).notNull().default(0),
  width: integer(), height: integer(), durationMs: integer(),
  codec: text(),
  sha256: text(),
  status: mediaStatus().notNull().default('uploading'),
  processorRef: text(),
  processorSubmittedAt: tstz(),
  variants: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  error: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [unique().on(t.workspaceId, t.id), index().on(t.workspaceId, t.createdAt), index().on(t.status)])

export const posts = pgTable('posts', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  authorUserId: text().references(() => users.id),
  baseCaption: text().notNull().default(''),
  status: postStatus().notNull().default('draft'),
  scheduledAt: tstz(),
  version: integer().notNull().default(1),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [unique().on(t.workspaceId, t.id), index().on(t.workspaceId, t.scheduledAt)])

export const postMedia = pgTable('post_media', {
  workspaceId: text().notNull(),
  postId: text().notNull(),
  position: integer().notNull(),
  mediaId: text().notNull()
}, t => [
  primaryKey({ columns: [t.postId, t.position] }),
  foreignKey({ columns: [t.workspaceId, t.postId], foreignColumns: [posts.workspaceId, posts.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.mediaId], foreignColumns: [mediaAssets.workspaceId, mediaAssets.id] }),
  index().on(t.mediaId)
])

export const postTargets = pgTable('post_targets', {
  id: id(),
  workspaceId: text().notNull(),
  postId: text().notNull(),
  socialAccountId: text().notNull(),
  platform: platform().notNull(),
  format: postFormat().notNull(),
  captionOverride: text(),
  mediaOverride: jsonb(),
  options: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  status: postTargetStatus().notNull().default('draft'),
  scheduledAt: tstz(),
  containerIds: text().array().notNull().default(sql`'{}'::text[]`),
  step: text(),
  externalId: text(),
  permalink: text(),
  attemptCount: integer().notNull().default(0),
  lastErrorCode: text(),
  lastErrorMsg: text(),
  jobId: text(),
  publishedAt: tstz(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  foreignKey({ columns: [t.workspaceId, t.postId], foreignColumns: [posts.workspaceId, posts.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.socialAccountId], foreignColumns: [socialAccounts.workspaceId, socialAccounts.id] }),
  index().on(t.status, t.scheduledAt),
  index().on(t.socialAccountId, t.publishedAt),
  index().on(t.postId)
])

export const publishAttempts = pgTable('publish_attempts', {
  id: id(),
  workspaceId: text().notNull(),
  postTargetId: text().notNull(),
  attemptNo: integer().notNull(),
  step: text().notNull(),
  httpStatus: integer(),
  errorCode: text(), errorSubcode: text(), fbtraceId: text(),
  response: jsonb(), // redacted
  outcome: text().notNull(),
  durationMs: integer(),
  createdAt: createdAt()
}, t => [
  foreignKey({ columns: [t.workspaceId, t.postTargetId], foreignColumns: [postTargets.workspaceId, postTargets.id] }).onDelete('cascade'),
  index().on(t.postTargetId)
])

/** Local rolling-24h publish count per account (quota). */
export const platformPublishLedger = pgTable('platform_publish_ledger', {
  id: id(),
  workspaceId: text().notNull(),
  socialAccountId: text().notNull(),
  publishedAt: tstz().notNull().defaultNow()
}, t => [
  foreignKey({ columns: [t.workspaceId, t.socialAccountId], foreignColumns: [socialAccounts.workspaceId, socialAccounts.id] }),
  index().on(t.socialAccountId, t.publishedAt)
])

export const insightSnapshots = pgTable('insight_snapshots', {
  id: id(),
  workspaceId: text().notNull(),
  postTargetId: text().notNull(),
  capturedAt: tstz().notNull().defaultNow(),
  metrics: jsonb().notNull()
}, t => [
  foreignKey({ columns: [t.workspaceId, t.postTargetId], foreignColumns: [postTargets.workspaceId, postTargets.id] }).onDelete('cascade'),
  index().on(t.postTargetId, t.capturedAt)
])

export const usageCounters = pgTable('usage_counters', {
  workspaceId: text().notNull().references(() => workspaces.id),
  periodStart: text().notNull(), // 'YYYY-MM-01' on the workspace clock
  metric: text().notNull(),
  count: integer().notNull().default(0)
}, t => [primaryKey({ columns: [t.workspaceId, t.periodStart, t.metric] })])
