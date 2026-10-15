import { sql } from 'drizzle-orm'
import { bigint, boolean, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './_shared'
import { mediaAssets, postTargets } from './channels'
import { workspaces } from './tenancy'

export const linkMerchant = pgEnum('link_merchant', ['shopee', 'tokopedia', 'tiktok_shop', 'lazada', 'other'])
export const shortLinkSource = pgEnum('short_link_source', ['vault', 'post', 'bio', 'dm'])
export const inAppBrowser = pgEnum('in_app_browser', ['ig', 'threads', 'fb', 'none'])
export const bioItemType = pgEnum('bio_item_type', ['product', 'link', 'header', 'social'])

export const links = pgTable('links', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  destinationUrl: text().notNull(),
  merchant: linkMerchant().notNull().default('other'),
  title: text(),
  imageUrl: text(),
  priceIdr: bigint({ mode: 'number' }),
  tags: text().array().notNull().default(sql`'{}'::text[]`),
  archived: boolean().notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [unique().on(t.workspaceId, t.id), index().on(t.workspaceId, t.createdAt)])

export const shortLinks = pgTable('short_links', {
  id: id(),
  workspaceId: text().notNull(),
  slug: text().notNull().unique(), // case-sensitive base62
  domain: text().notNull(),
  linkId: text().notNull(),
  postTargetId: text(),
  channel: text(),
  source: shortLinkSource().notNull().default('vault'),
  active: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  foreignKey({ columns: [t.workspaceId, t.linkId], foreignColumns: [links.workspaceId, links.id] }),
  foreignKey({ columns: [t.workspaceId, t.postTargetId], foreignColumns: [postTargets.workspaceId, postTargets.id] }).onDelete('cascade'),
  // One attribution link per post target and product (ARCHITECTURE §10.2).
  uniqueIndex('short_links_target_link_idx').on(t.postTargetId, t.linkId).where(sql`${t.postTargetId} is not null`),
  index().on(t.linkId),
  index().on(t.workspaceId)
])

/** Plain table in v1; monthly partitions later (ARCHITECTURE §19). */
export const linkClicks = pgTable('link_clicks', {
  id: id(),
  workspaceId: text().notNull(),
  shortLinkId: text().notNull(),
  clickedAt: tstz().notNull().defaultNow(),
  ipHash: text(),
  country: text(), region: text(), city: text(),
  device: text(), os: text(),
  inApp: inAppBrowser().notNull().default('none'),
  referrerDomain: text(),
  isBot: boolean().notNull().default(false),
  isUniqueDay: boolean().notNull().default(false)
}, t => [
  index().on(t.shortLinkId, t.clickedAt),
  index().on(t.workspaceId, t.clickedAt),
  index('link_clicks_clicked_at_brin_idx').using('brin', t.clickedAt)
])

export const bioPages = pgTable('bio_pages', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  handle: text().notNull(), // unique case-insensitively (index on lower(handle))
  title: text(),
  bio: text(),
  avatarMediaId: text(),
  avatarUrl: text(),
  theme: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  seo: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  socials: jsonb().$type<Record<string, string>>().notNull().default({}),
  published: boolean().notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  uniqueIndex('bio_pages_handle_lower_idx').on(sql`lower(${t.handle})`),
  foreignKey({ columns: [t.workspaceId, t.avatarMediaId], foreignColumns: [mediaAssets.workspaceId, mediaAssets.id] }),
  index().on(t.workspaceId)
])

export const bioCategories = pgTable('bio_categories', {
  id: id(),
  workspaceId: text().notNull(),
  bioPageId: text().notNull(),
  name: text().notNull(),
  position: integer().notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  foreignKey({ columns: [t.workspaceId, t.bioPageId], foreignColumns: [bioPages.workspaceId, bioPages.id] }).onDelete('cascade'),
  index().on(t.bioPageId)
])

export const bioItems = pgTable('bio_items', {
  id: id(),
  workspaceId: text().notNull(),
  bioPageId: text().notNull(),
  categoryId: text(),
  type: bioItemType().notNull(),
  linkId: text(),
  shortLinkId: text(),
  title: text(),
  imageUrl: text(),
  priceLabel: text(),
  badge: text(),
  pinned: boolean().notNull().default(false),
  position: integer().notNull().default(0),
  visible: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  foreignKey({ columns: [t.workspaceId, t.bioPageId], foreignColumns: [bioPages.workspaceId, bioPages.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.categoryId], foreignColumns: [bioCategories.workspaceId, bioCategories.id] }),
  foreignKey({ columns: [t.workspaceId, t.linkId], foreignColumns: [links.workspaceId, links.id] }),
  foreignKey({ columns: [t.workspaceId, t.shortLinkId], foreignColumns: [shortLinks.workspaceId, shortLinks.id] }),
  index().on(t.bioPageId, t.position)
])

/** Daily salt for ip_hash = sha256(ip ‖ salt): unique visitors without storing IPs. Deleted after 2 days. */
export const ipSalts = pgTable('ip_salts', {
  day: text().primaryKey(),
  salt: text().notNull(),
  createdAt: tstz().notNull().defaultNow()
})

/** Rollup for later (ARCHITECTURE §19); created now so the rollup job needs no migration. */
export const linkClickDaily = pgTable('link_click_daily', {
  day: text().notNull(),
  workspaceId: text().notNull(),
  shortLinkId: text().notNull(),
  channel: text().notNull().default(''),
  country: text().notNull().default(''),
  device: text().notNull().default(''),
  referrerDomain: text().notNull().default(''),
  clicks: integer().notNull().default(0),
  uniques: integer().notNull().default(0)
}, t => [primaryKey({ columns: [t.day, t.shortLinkId, t.channel, t.country, t.device, t.referrerDomain] }), index().on(t.workspaceId, t.day)])
