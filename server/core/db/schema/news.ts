import { index, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz } from './_shared'

export const newsRegion = pgEnum('news_region', ['id', 'world'])

/**
 * "Lagi rame" on Beranda (ARCHITECTURE §8.9): top headlines read every hour by `news.refresh`. Platform-wide, not
 * workspace-owned (everyone sees the same news). `seenCount` (hourly reads it was in the top list) and `bestRank`
 * stand in for how hot a story is, since the feed has no view counts.
 */
export const newsItems = pgTable('news_items', {
  id: id(),
  region: newsRegion().notNull(),
  /** The feed's own id for the story (its guid), stable across reads. */
  externalId: text().notNull(),
  title: text().notNull(),
  source: text(),
  url: text().notNull(),
  publishedAt: tstz(),
  firstSeenAt: tstz().notNull().defaultNow(),
  lastSeenAt: tstz().notNull().defaultNow(),
  seenCount: integer().notNull().default(1),
  lastRank: integer().notNull(),
  bestRank: integer().notNull(),
  createdAt: createdAt()
}, t => [uniqueIndex().on(t.region, t.externalId), index().on(t.region, t.lastSeenAt), index().on(t.region, t.firstSeenAt)])
