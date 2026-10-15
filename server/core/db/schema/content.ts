import { boolean, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { contactMessageStatus, createdAt, id, tstz, updatedAt, usageDevice } from './_shared'

export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: text(),
  group: text().notNull(),
  type: text().notNull().default('string'),
  label: text().notNull(),
  isSecret: boolean().notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.group)])

export const pages = pgTable('pages', {
  id: id(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  content: text().notNull(),
  excerpt: text(), metaTitle: text(), metaDescription: text(),
  isPublished: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
})

export const faqs = pgTable('faqs', {
  id: id(),
  question: text().notNull(), answer: text().notNull(),
  category: text().notNull().default('umum'),
  order: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.order)])

export const contactMessages = pgTable('contact_messages', {
  id: id(),
  name: text().notNull(), email: text().notNull(), phone: text(),
  subject: text(), message: text().notNull(),
  status: contactMessageStatus().notNull().default('new'),
  ip: text(),
  handledAt: tstz(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.status), index().on(t.createdAt)])

/** One row per day per form factor. Unit = device-day. No user id, no session id. */
export const usageDaily = pgTable('usage_daily', {
  dateKey: text().notNull(),
  device: usageDevice().notNull(),
  count: integer().notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [primaryKey({ columns: [t.dateKey, t.device] })])
