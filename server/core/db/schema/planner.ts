import { boolean, date, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core'
import { contentPillar, createdAt, id, updatedAt } from './_shared'
import { mediaAssets, posts } from './channels'
import { users } from './creators'
import { links } from './links'
import { workspaces } from './tenancy'

export const ideaStatus = pgEnum('idea_status', ['open', 'used', 'archived'])
export const momentKind = pgEnum('moment_kind', ['twin_date', 'payday', 'holiday', 'campaign'])

/**
 * "Momen belanja": shopping dates every creator plans around (11.11, gajian, Lebaran…). Reference data with
 * deterministic ids, edited by staff in /admin. Never deleted: ideas point at them, so `isActive` hides one.
 */
export const shoppingMoments = pgTable('shopping_moments', {
  id: id(),
  name: text().notNull(),
  nameEn: text(),
  kind: momentKind().notNull(),
  startsOn: date().notNull(), // local calendar days, inclusive
  endsOn: date().notNull(),
  prepDays: integer().notNull().default(3), // how many days before startsOn the first prepared idea lands
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.startsOn, t.endsOn)])

/**
 * "Bank Ide": a content idea before it becomes a post. Ideas carry no publishing state; turning one into a
 * post links them (`postId`, status `used`), and deleting that post puts the idea back to `open`.
 */
export const contentIdeas = pgTable('content_ideas', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  authorUserId: text().references(() => users.id),
  title: text().notNull(),
  note: text(),
  pillar: contentPillar(),
  plannedOn: date(), // a local day on the workspace clock; null = not on the calendar yet
  status: ideaStatus().notNull().default('open'),
  postId: text().references(() => posts.id, { onDelete: 'set null' }),
  momentId: text().references(() => shoppingMoments.id),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [
  unique().on(t.workspaceId, t.id),
  index().on(t.workspaceId, t.plannedOn),
  index().on(t.workspaceId, t.status, t.createdAt),
  index().on(t.postId)
])

export const contentIdeaLinks = pgTable('content_idea_links', {
  workspaceId: text().notNull(),
  ideaId: text().notNull(),
  linkId: text().notNull(),
  position: integer().notNull().default(0)
}, t => [
  primaryKey({ columns: [t.ideaId, t.linkId] }),
  foreignKey({ columns: [t.workspaceId, t.ideaId], foreignColumns: [contentIdeas.workspaceId, contentIdeas.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.linkId], foreignColumns: [links.workspaceId, links.id] }),
  index().on(t.linkId)
])

/** Removing a photo from Galeri Media quietly drops it from ideas (an idea is a sketch, not a record). */
export const contentIdeaMedia = pgTable('content_idea_media', {
  workspaceId: text().notNull(),
  ideaId: text().notNull(),
  mediaId: text().notNull(),
  position: integer().notNull()
}, t => [
  primaryKey({ columns: [t.ideaId, t.mediaId] }),
  foreignKey({ columns: [t.workspaceId, t.ideaId], foreignColumns: [contentIdeas.workspaceId, contentIdeas.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.mediaId], foreignColumns: [mediaAssets.workspaceId, mediaAssets.id] }).onDelete('cascade'),
  index().on(t.mediaId)
])
