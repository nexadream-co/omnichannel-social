import { pgEnum, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const id = () => text().primaryKey().$defaultFn(() => uuidv7())
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
export const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
export const tstz = () => timestamp({ withTimezone: true })

export const workspaceStatus = pgEnum('workspace_status', ['active', 'suspended', 'deleted'])
export const workspaceRole = pgEnum('workspace_role', ['owner', 'editor', 'viewer'])
export const subscriptionStatus = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'cancelled', 'downgraded', 'suspended'])
export const billingPeriod = pgEnum('billing_period', ['monthly', 'yearly'])
export const paymentStatus = pgEnum('payment_status', ['pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'challenge'])
export const authAudience = pgEnum('auth_audience', ['creator', 'staff'])
export const contactMessageStatus = pgEnum('contact_message_status', ['new', 'read', 'replied', 'archived'])
export const usageDevice = pgEnum('usage_device', ['phone', 'tablet', 'desktop'])
export const jobStatus = pgEnum('job_status', ['queued', 'running', 'done', 'dead', 'cancelled'])
export const contentPillar = pgEnum('content_pillar', ['promo', 'review', 'edukasi', 'hiburan', 'cerita'])
