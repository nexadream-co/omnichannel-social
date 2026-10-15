import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './_shared'
import { platform } from './channels'

export const dataDeletionStatus = pgEnum('data_deletion_status', ['pending', 'completed'])

/** Meta webhook inbox (payment callbacks use payment_webhook_events). Purged after 14 days. */
export const webhookEvents = pgTable('webhook_events', {
  id: id(),
  provider: text().notNull(),
  topic: text().notNull(),
  dedupeKey: text().notNull(),
  payload: jsonb().notNull(),
  receivedAt: tstz().notNull().defaultNow(),
  processedAt: tstz(),
  attempts: integer().notNull().default(0),
  error: text()
}, t => [uniqueIndex().on(t.provider, t.dedupeKey), index().on(t.receivedAt)])

export const dataDeletionRequests = pgTable('data_deletion_requests', {
  id: id(),
  platform: platform().notNull(),
  platformUserId: text().notNull(),
  confirmationCode: text().notNull().unique(),
  status: dataDeletionStatus().notNull().default('pending'),
  createdAt: createdAt(), updatedAt: updatedAt()
})
