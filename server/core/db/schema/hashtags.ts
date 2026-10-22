import { sql } from 'drizzle-orm'
import { index, jsonb, pgEnum, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './_shared'
import { platform } from './channels'
import { workspaces } from './tenancy'

export const hashtagBreadth = pgEnum('hashtag_breadth', ['broad', 'niche', 'specific'])
export const hashtagStatus = pgEnum('hashtag_status', ['recommended', 'generic', 'blocked'])
export const hashtagResearchStatus = pgEnum('hashtag_research_status', ['pending', 'ready'])

/** Admin-managed tag list (reference data, no workspace). Rows are never deleted: `blocked` / `generic` instead. */
export const hashtagLibrary = pgTable('hashtag_library', {
  id: id(),
  tag: text().notNull().unique(), // normal form: lowercase, no '#'
  niche: text().notNull(), // shared/hashtags/types.ts TAG_NICHES
  keywords: text().array().notNull().default(sql`'{}'::text[]`),
  breadth: hashtagBreadth().notNull().default('niche'),
  status: hashtagStatus().notNull().default('recommended'),
  platforms: platform().array().notNull().default(sql`'{}'::platform[]`), // empty = every platform
  notes: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.niche, t.status)])

/** A creator's saved groups of tags ("Set tersimpan"). */
export const hashtagSets = pgTable('hashtag_sets', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  name: text().notNull(),
  tags: text().array().notNull().default(sql`'{}'::text[]`),
  createdBy: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [unique().on(t.workspaceId, t.id), index().on(t.workspaceId, t.createdAt)])

/** One "Riset" per row: the result the composer polls, and the ledger for `tagResearchPerMonth`. */
export const hashtagResearchRuns = pgTable('hashtag_research_runs', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  userId: text().notNull(),
  captionHash: text().notNull(),
  platforms: platform().array().notNull().default(sql`'{}'::platform[]`),
  status: hashtagResearchStatus().notNull().default('ready'),
  result: jsonb().notNull(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  index().on(t.workspaceId, t.createdAt),
  index().on(t.workspaceId, t.captionHash, t.createdAt)
])

/** Cache of public tag activity per platform, shared by every workspace (no creator data in it). */
export const hashtagSignals = pgTable('hashtag_signals', {
  platform: platform().notNull(),
  tag: text().notNull(),
  data: jsonb().notNull(),
  fetchedAt: tstz().notNull().defaultNow()
}, t => [primaryKey({ columns: [t.platform, t.tag] })])
