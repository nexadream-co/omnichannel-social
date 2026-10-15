import { boolean, index, integer, jsonb, numeric, pgTable, text } from 'drizzle-orm/pg-core'
import { billingPeriod, createdAt, id, paymentStatus, subscriptionStatus, tstz, updatedAt } from './_shared'
import { workspaces } from './tenancy'

export const plans = pgTable('plans', {
  id: text().primaryKey(), // deterministic: plan-{slug}
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  priceMonthly: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  priceYearly: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  currency: text().notNull().default('IDR'),
  limits: jsonb().$type<Record<string, number>>().notNull(),
  features: jsonb().$type<Record<string, boolean>>().notNull(),
  trialDays: integer().notNull().default(14),
  isActive: boolean().notNull().default(true),
  isPublic: boolean().notNull().default(true),
  order: integer().notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt()
})

/** Current state only. ONLY transitionSubscription() (and the audited admin override) writes status. */
export const subscriptions = pgTable('subscriptions', {
  id: id(),
  workspaceId: text().notNull().unique().references(() => workspaces.id),
  planId: text().notNull().references(() => plans.id),
  status: subscriptionStatus().notNull().default('trialing'),
  period: billingPeriod().notNull().default('monthly'),
  trialEndsAt: tstz(),
  currentPeriodEnd: tstz(),
  graceEndsAt: tstz(),
  cancelledAt: tstz(),
  downgradedAt: tstz(),
  providerRef: text(),
  provider: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.planId), index().on(t.status), index().on(t.trialEndsAt), index().on(t.graceEndsAt)])

/** Append-only. Written in the same transaction as the change. */
export const subscriptionEvents = pgTable('subscription_events', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  transition: text().notNull(),
  fromStatus: subscriptionStatus(),
  toStatus: subscriptionStatus().notNull(),
  fromPlanSlug: text(),
  toPlanSlug: text().notNull(),
  period: billingPeriod().notNull(),
  createdAt: createdAt()
}, t => [index().on(t.createdAt), index().on(t.workspaceId, t.createdAt)])

export const paymentGateways = pgTable('payment_gateways', {
  id: text().primaryKey(), // deterministic: gateway-{provider}
  provider: text().notNull().unique(),
  label: text().notNull(),
  isActive: boolean().notNull().default(false),
  isSandbox: boolean().notNull().default(true),
  serverKey: text(), // encrypted
  clientKey: text(), // encrypted
  merchantId: text(),
  baseUrl: text(),
  orderPrefix: text(),
  config: jsonb(),
  createdAt: createdAt(), updatedAt: updatedAt()
})

export const payments = pgTable('payments', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  subscriptionId: text().references(() => subscriptions.id),
  orderId: text().notNull().unique(),
  gatewayOrderId: text().unique(),
  provider: text().notNull(),
  amount: integer().notNull(), // rupiah — never float
  currency: text().notNull().default('IDR'),
  status: paymentStatus().notNull().default('pending'),
  rawStatus: text(),
  paymentType: text(),
  period: billingPeriod().notNull().default('monthly'),
  planSlug: text(),
  redirectUrl: text(),
  paidAt: tstz(),
  expiresAt: tstz(),
  raw: jsonb(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.workspaceId), index().on(t.subscriptionId), index().on(t.status), index().on(t.workspaceId, t.createdAt)])

export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: id(),
  provider: text().notNull(),
  dedupeKey: text().notNull().unique(),
  orderId: text(),
  payload: jsonb().notNull(),
  headers: jsonb(),
  processedAt: tstz(),
  error: text(),
  replayCount: integer().notNull().default(0),
  createdAt: createdAt()
}, t => [index().on(t.provider), index().on(t.orderId), index().on(t.createdAt)])
