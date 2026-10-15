# 02 — Database Schema

This file covers the Drizzle schema of the **platform layer**. The Socialz.id domain tables (social accounts, posts, links, Etalase, auto-reply, Meta webhook inbox) are specified in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §7 and follow the same conventions.

## 1. Conventions (MUST)

- **Drizzle with `casing: 'snake_case'`.** TypeScript fields are `camelCase`; tables and columns are `snake_case`. Table names are plural.
- **Ids are `text`.** Normal rows get a **uuidv7** generated in the app (`$defaultFn(() => uuidv7())`), which keeps ids time-ordered. **Seeded reference rows use deterministic ids** (`menu-{slug}`, `plan-gratis`, `role-superadmin`, `gateway-nexadream-hub`, `email-{key}`), so re-seeds and migrations stay idempotent.
- `createdAt` / `updatedAt` (`timestamp with time zone`, default `now()`) on every table that gets edited. `updatedAt` is set by `$onUpdate(() => new Date())`.
- Timestamps are stored in UTC. Conversion to a local clock happens at the edges (UI formatting, report SQL; see `16` §9).
- **Every workspace-owned row carries `workspaceId`**, even when a parent row already implies it. Child tables of tenant data use composite FKs `(workspaceId, parentId)` where practical (see `../ARCHITECTURE.md` §7).
- Index every foreign key, plus `workspaceId` and anything filtered or sorted on. Add a compound `(workspaceId, createdAt)` index on high-volume tables.
- `onDelete: 'cascade'` only where a row is meaningless without its parent (role → role_permissions, user → sessions). **Workspace deletion is a soft delete** (`deletedAt`) plus an explicit purge job, never a cascade.
- **Money:** `numeric(14,2)` in the DB (Drizzle `numeric({ precision: 14, scale: 2, mode: 'number' })`), a plain number over the wire, converted in exactly one helper module (`server/core/money.ts`). **Gateway amounts are `integer` in rupiah.** Nothing is `real` / `double precision`.
- Enum *values* are English slugs (`pgEnum`). Display labels live in `shared/utils/status.ts`, never in the DB.

## 2. Entity overview

```
PLATFORM (back-office staff — better-auth "staff" instance)
staff_users ─▶ roles ─▶ role_permissions ◀─ permissions
staff_sessions, staff_accounts, staff_verifications
menus (self-tree, /admin sidebar)
staff_invitations

CREATORS (better-auth "creator" instance)          TENANCY
users, sessions, accounts, verifications           workspaces (= the creator's billing account)
                                                    ├── subscriptions ─▶ plans
                                                    ├── subscription_events[] (append-only)
                                                    ├── payments[]
                                                    ├── workspace_members ─▶ users
                                                    ├── workspace_invitations[]
                                                    ├── trial_claims (one trial per email)
                                                    ├── notifications[]
                                                    ├── audit_logs[]
                                                    └── DOMAIN: social_accounts, posts, links, bio_pages,
                                                        dm_rules … (see ../ARCHITECTURE.md §7)
BILLING
plans, payment_gateways, payment_webhook_events

MESSAGING                              CONTENT & CONFIG                 ANALYTICS
notifications, email_templates,        app_settings, pages, faqs,       usage_daily
notification_templates                 contact_messages
```

**better-auth replaces** the generic blueprint's `passwordHash` columns, `PasswordReset`, `AuthHandoff` and `TenantUserIdentity` tables:
- Passwords live in `accounts.password` (`providerId = 'credential'`).
- Google links live in `accounts` (`providerId = 'google'`, `accountId` = Google's stable subject id, never the email).
- Reset and verification tokens live in `verifications`.
- The OAuth handoff is unnecessary, because sessions are HttpOnly cookies and never travel in a URL.

## 3. Full schema

```ts
// server/core/db/schema/_shared.ts
import { pgEnum, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const id = () => text('id').primaryKey().$defaultFn(() => uuidv7())
export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
export const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())

export const workspaceStatus = pgEnum('workspace_status', ['active', 'suspended', 'deleted'])
export const workspaceRole = pgEnum('workspace_role', ['owner', 'editor', 'viewer'])
export const subscriptionStatus = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'cancelled', 'downgraded', 'suspended'])
export const billingPeriod = pgEnum('billing_period', ['monthly', 'yearly'])
export const paymentStatus = pgEnum('payment_status', ['pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'challenge'])
export const authAudience = pgEnum('auth_audience', ['creator', 'staff'])
export const contactMessageStatus = pgEnum('contact_message_status', ['new', 'read', 'replied', 'archived'])
export const usageDevice = pgEnum('usage_device', ['phone', 'tablet', 'desktop'])
```

### 3.1 Platform staff and RBAC (`/admin`)

```ts
// server/core/db/schema/staff.ts
export const staffUsers = pgTable('staff_users', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),     // better-auth field
  image: text(),                                          // better-auth field (avatar)
  phone: text(),
  isActive: boolean().notNull().default(true),
  roleId: text().notNull().references(() => roles.id),
  lastLoginAt: timestamp({ withTimezone: true }),
  lastSeenAt: timestamp({ withTimezone: true }),          // written at most once per 15 min per user
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.roleId), index().on(t.isActive)])

// better-auth core tables for the staff instance (configured with modelName overrides)
export const staffSessions = pgTable('staff_sessions', {
  id: id(),
  userId: text().notNull().references(() => staffUsers.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ipAddress: text(), userAgent: text(),
  impersonatedBy: text(),                                 // staff id when a superadmin impersonates staff
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.userId)])
export const staffAccounts = pgTable('staff_accounts', { /* better-auth account shape, see 3.2 */ })
export const staffVerifications = pgTable('staff_verifications', { /* better-auth verification shape */ })

export const roles = pgTable('roles', {
  id: text().primaryKey(),                                // deterministic: role-{slug}
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  isSuperAdmin: boolean().notNull().default(false),       // gates impersonation + destructive actions
  isSystem: boolean().notNull().default(false),           // seeded; not deletable
  createdAt: createdAt(), updatedAt: updatedAt()
})

export const permissions = pgTable('permissions', {
  id: id(),
  key: text().notNull().unique(),                         // dotted, English: 'workspaces.write'
  group: text().notNull(),
  description: text().notNull(),                          // Bahasa, shown in /admin/roles
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.group)])

export const rolePermissions = pgTable('role_permissions', {
  roleId: text().notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: text().notNull().references(() => permissions.id, { onDelete: 'cascade' })
}, t => [primaryKey({ columns: [t.roleId, t.permissionId] }), index().on(t.permissionId)])

/** Self-referential /admin sidebar. parentId null && path null = section header. Max depth 3. */
export const menus = pgTable('menus', {
  id: text().primaryKey(),                                // deterministic: menu-{slug}
  parentId: text().references((): AnyPgColumn => menus.id, { onDelete: 'cascade' }),
  label: text().notNull(),                                // Bahasa
  slug: text().notNull().unique(),                        // English
  path: text(), icon: text(), permissionKey: text(),
  order: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.parentId), index().on(t.order)])

/** Staff invitation (there is no public /admin registration). */
export const staffInvitations = pgTable('staff_invitations', {
  id: id(),
  email: text().notNull(), name: text(),
  roleId: text().notNull().references(() => roles.id),
  tokenHash: text().notNull().unique(),                   // SHA-256; raw token only in the email link
  invitedById: text().references(() => staffUsers.id),
  expiresAt: timestamp({ withTimezone: true }).notNull(), // 7 days
  acceptedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.email), index().on(t.roleId)])
```

### 3.2 Creators (better-auth "creator" instance)

```ts
// server/core/db/schema/creators.ts
export const users = pgTable('users', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),                       // stored lowercased
  emailVerified: boolean().notNull().default(false),
  image: text(),
  phone: text().unique(),                                 // normalized 62xxxxxxxxxx; optional
  isActive: boolean().notNull().default(true),
  locale: text().notNull().default('id'),                 // 'id' | 'en'
  lastLoginAt: timestamp({ withTimezone: true }),
  lastSeenAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.isActive)])

export const sessions = pgTable('sessions', {
  id: id(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ipAddress: text(), userAgent: text(),
  activeWorkspaceId: text(),                              // pinned workspace (the generic blueprint's `tid` claim)
  impersonatedBy: text(),                                 // staff id when staff impersonate a creator
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.userId)])

export const accounts = pgTable('accounts', {
  id: id(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text().notNull(),                           // 'credential' | 'google'
  accountId: text().notNull(),                            // provider's stable subject id — never the email
  password: text(),                                       // hash, credential provider only
  accessToken: text(), refreshToken: text(), idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [uniqueIndex().on(t.providerId, t.accountId), index().on(t.userId)])

export const verifications = pgTable('verifications', {
  id: id(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.identifier)])
```

> These auth tables are **not** the social accounts a creator connects for publishing. Those are `social_accounts` (domain, `../ARCHITECTURE.md` §7.2), with tokens encrypted by `server/core/crypto.ts`.

### 3.3 Tenancy

```ts
// server/core/db/schema/tenancy.ts
export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text().notNull(),                                 // defaults to the creator's name
  slug: text().notNull().unique(),
  timezone: text().notNull().default('Asia/Jakarta'),     // WIB | WITA | WIT
  status: workspaceStatus().notNull().default('active'),
  suspendedAt: timestamp({ withTimezone: true }),
  suspendedReason: text(),
  dataConsentAcceptedAt: timestamp({ withTimezone: true }),   // UU PDP consent
  onboardingCompletedAt: timestamp({ withTimezone: true }),   // null = onboarding checklist not finished (non-blocking, see 05)
  downgradeResolvedAt: timestamp({ withTimezone: true }),     // null after a downgrade put it over a cap → owner must pick
  entitlementsVersion: integer().notNull().default(0),    // bumped by invalidateEntitlements(); part of the cache key on every instance (01 §7)
  deletedAt: timestamp({ withTimezone: true }),               // soft delete
  deleteRequestedAt: timestamp({ withTimezone: true }),
  // creator profile (collected in onboarding, all optional)
  niche: text(),                                          // e.g. 'fashion', 'beauty', 'gadget'
  affiliatePrograms: text().array().notNull().default(sql`'{}'::text[]`),  // 'shopee' | 'tiktok_shop' | …
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.status), index().on(t.deletedAt), index().on(t.createdAt)])

export const workspaceMembers = pgTable('workspace_members', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: workspaceRole().notNull().default('owner'),
  isActive: boolean().notNull().default(true),            // deactivated, never deleted
  invitedById: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [uniqueIndex().on(t.workspaceId, t.userId), index().on(t.userId), index().on(t.workspaceId)])

export const workspaceInvitations = pgTable('workspace_invitations', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text().notNull(), name: text(),
  role: workspaceRole().notNull().default('editor'),
  tokenHash: text().notNull().unique(),                   // SHA-256; raw token only in the email link
  invitedById: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull(), // 7 days
  acceptedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [uniqueIndex().on(t.workspaceId, t.email), index().on(t.workspaceId), index().on(t.email)])

/** One trial per normalized email address. */
export const trialClaims = pgTable('trial_claims', {
  id: id(),
  emailNormalized: text().notNull().unique(),
  workspaceId: text().notNull().unique().references(() => workspaces.id),
  createdAt: createdAt()
})
```

### 3.4 Plans, subscriptions and billing

```ts
// server/core/db/schema/billing.ts
export const plans = pgTable('plans', {
  id: text().primaryKey(),                                // deterministic: plan-{slug}
  slug: text().notNull().unique(),                        // 'gratis' | 'kreator' | 'pro' (editable)
  name: text().notNull(),
  description: text(),
  priceMonthly: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  priceYearly: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull(),
  currency: text().notNull().default('IDR'),
  limits: jsonb().$type<Record<string, number>>().notNull(),     // keyed by LIMIT_KEYS; -1 = unlimited
  features: jsonb().$type<Record<string, boolean>>().notNull(),  // keyed by FEATURE_KEYS
  trialDays: integer().notNull().default(14),
  isActive: boolean().notNull().default(true),            // can be bought
  isPublic: boolean().notNull().default(true),            // shown on pricing/billing pages
  order: integer().notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt()
})

/** Current state only. History is subscription_events. ONLY transitionSubscription() (and the audited admin override) writes status. */
export const subscriptions = pgTable('subscriptions', {
  id: id(),
  workspaceId: text().notNull().unique().references(() => workspaces.id),
  planId: text().notNull().references(() => plans.id),
  status: subscriptionStatus().notNull().default('trialing'),
  period: billingPeriod().notNull().default('monthly'),
  trialEndsAt: timestamp({ withTimezone: true }),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  graceEndsAt: timestamp({ withTimezone: true }),
  cancelledAt: timestamp({ withTimezone: true }),
  downgradedAt: timestamp({ withTimezone: true }),
  providerRef: text(),                                    // recurring mandate, if a future driver supports it
  provider: text(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.planId), index().on(t.status), index().on(t.trialEndsAt), index().on(t.graceEndsAt)])

/** Append-only. Written in the same transaction as the change. */
export const subscriptionEvents = pgTable('subscription_events', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  transition: text().notNull(),                           // SubscriptionTransition | 'signup' | 'admin_override'
  fromStatus: subscriptionStatus(),
  toStatus: subscriptionStatus().notNull(),
  fromPlanSlug: text(),
  toPlanSlug: text().notNull(),
  period: billingPeriod().notNull(),
  createdAt: createdAt()
}, t => [index().on(t.createdAt), index().on(t.workspaceId, t.createdAt)])

export const paymentGateways = pgTable('payment_gateways', {
  id: text().primaryKey(),                                // deterministic: gateway-{provider}
  provider: text().notNull().unique(),                    // 'nexadream_hub'
  label: text().notNull(),
  isActive: boolean().notNull().default(false),           // exactly one may be active
  isSandbox: boolean().notNull().default(true),
  serverKey: text(),                                      // AES-256-GCM ciphertext; hub: platform API key
  clientKey: text(),                                      // encrypted
  merchantId: text(),
  baseUrl: text(),                                        // https://nexadream.id
  orderPrefix: text(),                                    // issued by the hub to Socialz.id
  config: jsonb(),
  createdAt: createdAt(), updatedAt: updatedAt()
})

export const payments = pgTable('payments', {
  id: id(),
  workspaceId: text().notNull().references(() => workspaces.id),
  subscriptionId: text().references(() => subscriptions.id),
  orderId: text().notNull().unique(),                     // ours: SZ-<base36 time>-<rand>
  gatewayOrderId: text().unique(),                        // what the gateway sees (hub: PREFIX-orderId)
  provider: text().notNull(),
  amount: integer().notNull(),                            // rupiah — NEVER float
  currency: text().notNull().default('IDR'),
  status: paymentStatus().notNull().default('pending'),
  rawStatus: text(),                                      // provider's own word, for support
  paymentType: text(),
  period: billingPeriod().notNull().default('monthly'),
  planSlug: text(),
  redirectUrl: text(),                                    // hosted page — lets a pending charge be resumed
  paidAt: timestamp({ withTimezone: true }),
  expiresAt: timestamp({ withTimezone: true }),
  raw: jsonb(),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.workspaceId), index().on(t.subscriptionId), index().on(t.status), index().on(t.workspaceId, t.createdAt)])

/** Every raw payment callback, stored before it is applied. dedupeKey makes provider retries no-ops; admin can replay. */
export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: id(),
  provider: text().notNull(),
  dedupeKey: text().notNull().unique(),                   // `${provider}:${sha256(driver.webhookDedupeSource(payload))}`
  orderId: text(),
  payload: jsonb().notNull(),
  headers: jsonb(),
  processedAt: timestamp({ withTimezone: true }),
  error: text(),
  replayCount: integer().notNull().default(0),
  createdAt: createdAt()
}, t => [index().on(t.provider), index().on(t.orderId), index().on(t.createdAt)])
```

### 3.5 Audit, notifications and templates

```ts
// server/core/db/schema/system.ts
export const auditLogs = pgTable('audit_logs', {
  id: id(),
  audience: authAudience().notNull(),
  actorId: text(),                                        // staff id (FK-free on purpose) or null; creator id lives in metadata.userId
  actorName: text(),
  impersonatorId: text(),                                 // set inside an impersonated session
  workspaceId: text().references(() => workspaces.id),
  action: text().notNull(),                               // English slug: 'auth.sign_in', 'workspace.suspend', 'post.publish_failed'
  targetType: text(), targetId: text(),
  metadata: jsonb(),
  ip: text(), userAgent: text(),
  createdAt: createdAt()
}, t => [index().on(t.actorId), index().on(t.workspaceId), index().on(t.action), index().on(t.createdAt)])

export const notifications = pgTable('notifications', {
  id: id(),
  audience: authAudience().notNull(),
  staffUserId: text().references(() => staffUsers.id, { onDelete: 'cascade' }),   // staff recipient
  userId: text().references(() => users.id, { onDelete: 'cascade' }),             // creator recipient
  workspaceId: text().references(() => workspaces.id),
  templateKey: text(),
  title: text().notNull(),
  body: text().notNull(),
  actionUrl: text(), icon: text(),
  level: text().notNull().default('info'),                // info | success | warning | error
  readAt: timestamp({ withTimezone: true }),
  createdAt: createdAt()
}, t => [index().on(t.staffUserId, t.readAt), index().on(t.userId, t.readAt), index().on(t.workspaceId), index().on(t.createdAt)])

export const emailTemplates = pgTable('email_templates', {
  id: text().primaryKey(),                                // deterministic: email-{key}
  key: text().notNull().unique(),                         // 'password_reset'
  name: text().notNull(),                                 // Bahasa
  subject: text().notNull(),
  body: text().notNull(),                                 // HTML with {{token}} placeholders
  description: text(),
  variables: jsonb().notNull(),                           // [{ token, label, sample }]
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
})

export const notificationTemplates = pgTable('notification_templates', {
  id: text().primaryKey(),                                // deterministic: notif-{key}
  key: text().notNull().unique(),
  name: text().notNull(),
  title: text().notNull(), body: text().notNull(),
  actionLabel: text(), actionUrl: text(), icon: text(),
  level: text().notNull().default('info'),
  variables: jsonb().notNull(),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
})
```

### 3.6 Settings, CMS and analytics

```ts
// server/core/db/schema/content.ts
export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: text(),
  group: text().notNull(),                                // company | email | billing | privacy | app | channels | system
  type: text().notNull().default('string'),               // string|number|boolean|json|secret|text|select
  label: text().notNull(),
  isSecret: boolean().notNull().default(false),           // encrypted at rest, masked on read
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.group)])

export const pages = pgTable('pages', {
  id: id(),
  slug: text().notNull().unique(),                        // privacy, terms, kebijakan-pembayaran, bantuan …
  title: text().notNull(),
  content: text().notNull(),                              // sanitized HTML from the rich-text editor
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
  handledAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [index().on(t.status), index().on(t.createdAt)])

/** One row per day per form factor. Unit = device-day. No user id, no session id. */
export const usageDaily = pgTable('usage_daily', {
  dateKey: text().notNull(),                              // 'YYYY-MM-DD' on the platform clock (Asia/Jakarta)
  device: usageDevice().notNull(),
  count: integer().notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt()
}, t => [primaryKey({ columns: [t.dateKey, t.device] })])
```

### 3.7 Jobs and serverless state

Specified in `15` §1.1 (`jobs`, `job_schedules`, `system_heartbeat`) and `16` §4 (`rate_limit_buckets`). They replace pg-boss's tables and every in-memory store, because function instances share nothing but the database (`19` §6).

```ts
// server/core/db/schema/system.ts
export const rateLimitBuckets = pgTable('rate_limit_buckets', {   // created UNLOGGED in the migration SQL
  key: text().notNull(),                                  // `${scope}:${identifier}`
  windowStart: timestamp({ withTimezone: true }).notNull(),
  count: integer().notNull().default(0),
  expiresAt: timestamp({ withTimezone: true }).notNull()
}, t => [primaryKey({ columns: [t.key, t.windowStart] }), index().on(t.expiresAt)])
```

## 4. Seeded reference data

The seed (`scripts/seed.ts`) is **idempotent upserts** reading from the shared catalogs:

| Data | Source catalog | Id pattern |
|---|---|---|
| Permissions | `shared/utils/permissions.ts` (`PERMISSION_KEYS`) | uuid, unique `key` |
| Roles `superadmin`, `admin`, `support` | seed | `role-{slug}` |
| Menus | `shared/utils/menus.ts` (`MENU_TREE` → `flattenMenuTree`) | `menu-{slug}` |
| App settings | `shared/utils/settings.ts` (`SETTINGS_CATALOG`) | `key` is the PK |
| Email templates | `shared/utils/templates.ts` (`EMAIL_TEMPLATES`) | `email-{key}` |
| Notification templates | `NOTIFICATION_TEMPLATES` | `notif-{key}` |
| Plans `gratis`, `kreator`, `pro` | seed (values in `06` §2) | `plan-{slug}` |
| Job schedules | `server/core/jobs/schedules.ts` (`15` §3.6) | `name` is the PK |
| Payment gateway `nexadream_hub` | seed (inactive, no credentials, `baseUrl: 'https://nexadream.id'`) | `gateway-nexadream_hub` |
| Pages `privacy`, `terms`, `kebijakan-pembayaran`, `bantuan` | seed | uuid, unique `slug` |
| FAQ entries | seed | uuid |
| First superadmin staff user | seed (dev password; change in prod) | |
| Demo creator + workspace (dev only) | seed, `NODE_ENV !== 'production'` | |

Seed roles:

```ts
const all = PERMISSION_KEYS
// admin: everything except what lets someone widen their own access
const adminKeys = all.filter(k => !['roles.write', 'permissions.write', 'menus.write'].includes(k))
// support: every .read except revenue reports, plus replying to messages and retrying failed posts
const supportKeys = all.filter(k => k.endsWith('.read') && k !== 'reports.read').concat(['messages.write', 'publishing.write'])
```

On each role upsert, that role's `role_permissions` rows are deleted and re-created from the list.

## 5. Shipping new reference data to production (MUST)

Migrations run before each deploy. The seed does **not** travel with a deploy, and re-running it overwrites admin edits. So when a feature needs a new permission, menu, template, setting or plan:

1. Add it to the shared catalog, so a fresh `db:reset` is complete.
2. **Also** write it into a **new** migration's SQL as an idempotent insert. Supply `id` and `updated_at` explicitly, because raw SQL bypasses Drizzle defaults:

   ```sql
   INSERT INTO "menus" ("id","parent_id","label","slug","path","icon","permission_key","order","is_active","created_at","updated_at")
   VALUES ('menu-publish-failures','menu-operations','Postingan gagal','publish-failures','/admin/publish-failures','i-lucide-alert-triangle','publishing.read',2,true,now(),now())
   ON CONFLICT ("slug") DO NOTHING;
   ```

3. Never edit a migration that has already been applied.

Partial unique indexes (e.g. "at most one live subscription per workspace", "one `dm_sent` per rule and commenter") are written by hand in migration SQL when Drizzle can't express them.
