# 06 — Plans & Entitlements

## 1. Principle: tiers are config, not code

Plan limits and features must be **editable by a superadmin without a deploy**. `plans.limits` and `plans.features` are JSONB columns. Code fixes only the **keys** (and their labels); values live in the DB and are edited at `/admin/plans`.

**Never branch on a plan slug** to decide what a workspace may do. `if (plan.slug === 'kreator')` is a bug. Read `features` / `limits`. Slugs are cosmetic (badge colour) at most.

## 2. Key catalog — `shared/utils/plans.ts`

```ts
export const LIMIT_KEYS = [
  'socialAccounts',            // active connected social accounts (IG, Threads, FB Page each count 1)
  'scheduledPostsPerMonth',    // post targets scheduled or published in the current calendar month (workspace timezone)
  'bioPages',                  // published Etalase pages
  'autoReplyRules',            // active Balas Otomatis rules
  'autoReplyDmsPerMonth',      // auto-reply DMs sent in the current calendar month
  'clickRetentionDays',        // how far back link statistics can look
  'teamMembers',               // active members + outstanding invitations, incl. the owner
  'mediaStorageMb',            // total size of the media library
  'activityLogRetentionDays',  // how far back the workspace activity log can look
  'tagResearchPerMonth'        // hashtag research runs this calendar month (0 = not on this plan)
] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

export const FEATURE_KEYS = [
  'customSlug',        // choose your own short link names
  'anyDestination',    // shorten any https URL, not only allowlisted affiliate domains
  'analyticsExport',   // CSV export of statistics
  'teamAccess',        // invite editors / viewers
  'activityLog',       // workspace-visible audit trail
  'prioritySupport'
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

export type PlanLimits = Record<LimitKey, number>
export type PlanFeatures = Record<FeatureKey, boolean>

export const UNLIMITED = -1            // everywhere

/** label = column/field heading; sentence = noun phrase used in messages; hint = form help */
export const LIMIT_META: Record<LimitKey, { label: string, sentence: string, hint: string, unit?: string }> = {
  socialAccounts:           { label: 'Akun media sosial', sentence: 'akun media sosial', hint: 'Instagram, Threads dan Halaman Facebook masing-masing dihitung 1.', unit: 'akun' },
  scheduledPostsPerMonth:   { label: 'Postingan per bulan', sentence: 'postingan terjadwal per bulan', hint: 'Satu postingan ke 3 akun dihitung 3.', unit: 'postingan' },
  bioPages:                 { label: 'Halaman Etalase', sentence: 'halaman Etalase', hint: '', unit: 'halaman' },
  autoReplyRules:           { label: 'Aturan Balas Otomatis', sentence: 'aturan Balas Otomatis aktif', hint: '', unit: 'aturan' },
  autoReplyDmsPerMonth:     { label: 'DM otomatis per bulan', sentence: 'DM otomatis per bulan', hint: '', unit: 'DM' },
  clickRetentionDays:       { label: 'Riwayat statistik', sentence: 'hari riwayat statistik', hint: 'Seberapa jauh ke belakang statistik klik bisa dilihat.', unit: 'hari' },
  teamMembers:              { label: 'Anggota tim', sentence: 'anggota tim', hint: 'Termasuk pemilik.', unit: 'orang' },
  mediaStorageMb:           { label: 'Penyimpanan media', sentence: 'MB penyimpanan media', hint: '', unit: 'MB' },
  activityLogRetentionDays: { label: 'Riwayat log aktivitas', sentence: 'hari riwayat log aktivitas', hint: '', unit: 'hari' },
  tagResearchPerMonth:      { label: 'Riset tagar per bulan', sentence: 'riset tagar per bulan', hint: 'Tiap kali tombol "Riset" dipakai untuk satu keterangan. Cek kualitas tagar selalu gratis.', unit: 'riset' }
}
export const FEATURE_META: Record<FeatureKey, { label: string, hint: string }>

export function formatLimit(key, value): string   // -1 → 'Tanpa batas', else id-ID number + unit

/** Defaults used when a plan row predates a newly added key: the conservative (free) value. */
export const DEFAULT_LIMITS: PlanLimits
export const DEFAULT_FEATURES: PlanFeatures          // all false

export function normalizeLimits(raw: unknown): PlanLimits     // start from defaults, copy finite numbers
export function normalizeFeatures(raw: unknown): PlanFeatures // start from defaults, copy booleans
```

Always read plan JSON through `normalizeLimits` / `normalizeFeatures`. A new key added in code must work for plans saved before it existed, and the default is the conservative value.

### 2.1 Seeded plans

| | `gratis` | `kreator` | `pro` |
|---|---|---|---|
| Name | Gratis | Kreator | Pro |
| Monthly / yearly (IDR) | 0 / 0 | 49.000 / 490.000 | 99.000 / 990.000 |
| Trial days | 0 | 14 | 14 |
| `isActive` / `isPublic` at v1 launch | true / true | true / true | **false / false** (enabled later from `/admin/plans`) |
| socialAccounts | 2 | 5 | 12 |
| scheduledPostsPerMonth | 20 | 300 | 1.500 |
| bioPages | 1 | 1 | 3 |
| autoReplyRules | 1 | 10 | -1 |
| autoReplyDmsPerMonth | 100 | 1.000 | 5.000 |
| clickRetentionDays | 30 | 180 | 365 |
| teamMembers | 1 | 1 | 3 |
| mediaStorageMb | 500 | 5.000 | 20.000 |
| activityLogRetentionDays | 0 | 30 | 90 |
| tagResearchPerMonth | 0 | 100 | -1 |
| anyDestination | – | ✓ | ✓ |
| customSlug | – | ✓ | ✓ |
| analyticsExport | – | ✓ | ✓ |
| teamAccess | – | – | ✓ |
| activityLog | – | ✓ | ✓ |
| prioritySupport | – | – | ✓ |

Prices include PPN; confirm with a tax advisor before launch. Settings: `billing.trialPlanSlug = 'kreator'`, `billing.defaultPlanSlug = 'gratis'`, `billing.gracePeriodDays = 3`, `billing.oneTrialPerEmail = true`.

## 3. Entitlements module — `server/core/entitlements.ts`

**The only place `plans.limits` / `plans.features` are read.** It is plain core code, so job handlers use it too (e.g. the DM sender checks `autoReplyDmsPerMonth`).

```ts
export interface Entitlements {
  workspaceId: string
  planSlug: string            // the plan on the subscription row
  planName: string            // name of the plan actually in force
  effectivePlanSlug: string   // honouring trial and grace
  status: string
  limits: PlanLimits
  features: PlanFeatures
  trialEndsAt: Date | null
  trialDaysRemaining: number | null
  graceEndsAt: Date | null
  currentPeriodEnd: Date | null
  isTrialing: boolean
  isInGrace: boolean
}

getEntitlements(workspaceId): Promise<Entitlements>    // 60 s per-workspace cache
can(workspaceId, feature): Promise<boolean>
limit(workspaceId, key): Promise<number>               // -1 = unlimited
isWithinLimit(workspaceId, key, currentCount): Promise<boolean>
assertWithinLimit(workspaceId, key, currentCount)      // throws 402 LIMIT_REACHED
requireEntitlement(ctx, feature)                       // throws 402 PLAN_REQUIRED
invalidateEntitlements(workspaceId?)                   // no arg = clear all
gracePeriodDays(): Promise<number>                     // setting billing.gracePeriodDays
```

Does the subscription grant its plan *right now*?

```ts
function subscriptionGrantsPlan(s: Subscription, now: Date): boolean {
  switch (s.status) {
    case 'trialing':  return !s.trialEndsAt || s.trialEndsAt > now
    case 'active':    return true
    case 'cancelled': return Boolean(s.currentPeriodEnd && s.currentPeriodEnd > now)
    case 'past_due':  return Boolean(s.graceEndsAt && s.graceEndsAt > now)
    default:          return false   // downgraded, suspended
  }
}
// effective plan = grants ? subscription.plan : the 'gratis' plan  (never "no access")
```

`assertWithinLimit` error:

```ts
throw createError({
  statusCode: 402,
  statusMessage: `Paket ${planName} hanya mengizinkan ${formatNumber(max)} ${LIMIT_META[key].sentence}. Upgrade untuk menambah lagi.`,
  data: { code: 'LIMIT_REACHED', limit: key, max, current: currentCount }
})
```

`requireEntitlement(ctx, feature)` error:

```ts
throw createError({
  statusCode: 402,
  statusMessage: 'Fitur ini belum tersedia di paket Anda. Upgrade untuk membukanya.',
  data: { code: 'PLAN_REQUIRED', feature }
})
```

`invalidateEntitlements(workspaceId)` clears the local cache **and** increments `workspaces.entitlements_version`, which is part of the cache key, so every other function instance recomputes on its next request (`01` §7). With no argument it bumps every workspace on the edited plan.

**Call `invalidateEntitlements(workspaceId)` after any change to** the subscription, the plan, the social accounts, the team membership or the auto-reply rules. Call it with no argument after editing a plan (every workspace on it is stale).

### 3.1 Usage counters

Monthly limits count real rows; nothing keeps a separate counter that could drift:

| Limit | Counted as |
|---|---|
| `socialAccounts` | `social_accounts` with `status = 'active'` |
| `scheduledPostsPerMonth` | `post_targets` with `scheduled_at` in the current calendar month (workspace timezone) and status not in (`draft`, `cancelled`) |
| `bioPages` | published `bio_pages` |
| `autoReplyRules` | `dm_rules` with `active = true` |
| `autoReplyDmsPerMonth` | `dm_events` with `status = 'dm_sent'` this calendar month |
| `teamMembers` | active `workspace_members` + pending unexpired `workspace_invitations` |
| `mediaStorageMb` | `sum(media_assets.bytes)` where status ≠ `failed` |
| `tagResearchPerMonth` | `hashtag_research_runs` created this calendar month (a repeat for the same caption within 30 minutes reuses its row) |

Month boundaries are cut on the workspace clock in SQL with the `(col AT TIME ZONE 'UTC') AT TIME ZONE tz` rule (`16` §9).

## 4. 402 vs 403

- **403**: "your role can't do this" (talk to the workspace owner).
- **402**: "your plan doesn't include this" (upgrade).

The console catches 402 globally and opens the **upgrade dialog**. The two are never conflated.

## 5. How gates behave past the limit

Three behaviours exist; one is picked per rule:

| Behaviour | When to use | Example |
|---|---|---|
| **Refuse** (402) | creating something new beyond a cap; using a paid action | connecting a 3rd account on Gratis → `LIMIT_REACHED`; CSV export → `PLAN_REQUIRED` |
| **Clamp** (succeed with less) | reading history further back than allowed | `clickRetentionDays` clamps the date window and returns `window.clamped: true` so the UI explains |
| **Degrade silently** (keep data, stop the effect) | a downgrade must not destroy configuration | a downgraded owner's Etalase pages beyond `bioPages` are deactivated, not deleted |

| Rule | Where | Past the limit |
|---|---|---|
| `socialAccounts` | connect a social account, reactivate a disabled one | 402 `LIMIT_REACHED` |
| `bioPages` | publish an Etalase page | 402 `LIMIT_REACHED` |
| `autoReplyRules` | activate a rule (create, or resume a paused one) | 402 `LIMIT_REACHED` |
| `teamMembers` (active + outstanding invites) | invite, reactivate, accept | 402 `LIMIT_REACHED` |
| `scheduledPostsPerMonth` | schedule or publish now (counted per target) | 402 `LIMIT_REACHED`; the composer shows the remaining count before submit |
| `autoReplyDmsPerMonth` | DM sender (`dm.send` job) | **skip**: `dm_events.status = 'rate_limited'`, reason `plan_quota`; the owner gets `autoreply_paused` **once per month**, not per comment |
| `mediaStorageMb` | presign an upload | 402 `LIMIT_REACHED` |
| `tagResearchPerMonth` | "Riset" in the composer's hashtag panel | 402 `PLAN_REQUIRED` when 0, `LIMIT_REACHED` when used up; the quality check and list ideas stay free |
| `clickRetentionDays` | statistics window resolver | window clamped, flagged |
| `activityLogRetentionDays` | activity log query (also capped by `privacy.auditRetentionDays`) | window clamped |
| `anyDestination` | link create/edit (when `channels.links.freePlanAllowlistOnly` is on) | 402 `PLAN_REQUIRED` for non-allowlisted domains; existing links keep working |
| `customSlug` | create / edit a short link | custom slug ignored on save → auto slug, with a hint that it's a Kreator feature |
| `analyticsExport` | `requireEntitlement` on export routes | 402 `PLAN_REQUIRED` |
| `teamAccess` | team page + invite | 402 `PLAN_REQUIRED` |
| `activityLog` | activity endpoint | 402 `PLAN_REQUIRED` |

Retention **clamps** rather than refuses on purpose: a shorter chart the creator understands beats an error they cannot act on.

Deliberately **ungated on every tier** (record next to the table so nobody "fixes" them):
- Short link redirects always work, even past every limit and even after a downgrade. Breaking a follower's tap would hurt the creator's income and our reputation.
- Clicks are always recorded; only the *viewing window* is clamped.
- Already-scheduled posts within the month's allowance are never cancelled by a plan change; only disabled accounts send their targets back to draft (`05` §5).
- Disconnecting accounts, deleting posts and exporting data are always allowed.

## 6. Usage counts for the UI

`GET /api/app/entitlements` returns entitlements **plus current usage**, so the UI can disable a button before the API answers 402:

```json
{ "...Entitlements": "…", "usage": { "socialAccounts": 2, "scheduledPostsPerMonth": 14, "bioPages": 1, "autoReplyRules": 1, "autoReplyDmsPerMonth": 37, "teamMembers": 1, "mediaStorageMb": 212, "tagResearchPerMonth": 4 } }
```

Client composable `useEntitlements()` (`useState`-backed, one fetch per page load, refreshed after mutations that change usage):

```ts
can(feature) / limit(key) / isUnlimited(key) / used(key) / remaining(key) / atLimit(key)
upgradeRequired(feature, message?)   // opens the dialog
handlePlanError(caught): boolean     // 402 → opens the dialog with the server message; returns true if handled
```

Every write that can hit a gate wraps its catch:

```ts
try { await apiFetch('/api/app/…', { method: 'POST', body }) }
catch (e) { if (!handlePlanError(e)) toast.add({ title: 'Gagal menyimpan', description: extractErrorMessage(e), color: 'error' }) }
```

Upgrade prompts appear **only when a limit is actually hit or a locked feature is opened** (simplicity principle: the free plan must feel useful, not nagging). Usage bars live on the billing page and as a small badge in the shell, never as pop-ups.

Navigation entries tied to a paid feature are **shown with a lock**, never hidden; the page opens the upgrade dialog. Hiding them hides what we are selling.

An "Upgrade" button at the foot of the creator rail hides itself when the current plan already has every feature, or when the role cannot buy (`billing.manage`). It reads `features`, never a slug.

## 7. Admin plan management

Endpoints (`plans.read` / `plans.write`):

```
GET    /api/admin/plans
POST   /api/admin/plans          body = planSchema
PATCH  /api/admin/plans/:id      body = planSchema.partial()
DELETE /api/admin/plans/:id
```

```ts
export const planSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  priceMonthly: z.number().min(0),
  priceYearly: z.number().min(0),
  trialDays: z.number().int().min(0),
  isActive: z.boolean().default(true),   // purchasable
  isPublic: z.boolean().default(true),   // listed on pricing + billing pages
  order: z.number().int().default(0),
  limits: z.record(z.enum(LIMIT_KEYS), z.number()),      // keys validated against the catalog
  features: z.record(z.enum(FEATURE_KEYS), z.boolean())
})
```

- Create: slug unique (409).
- Update: slug clash → 409. Then `invalidateEntitlements()` (all workspaces).
- Delete: refused while any subscription references it ("Nonaktifkan saja paket ini."), and the `gratis` plan (the downgrade target) can never be deleted.
- The editor form renders one numeric field per `LIMIT_KEYS` entry (with a "Tanpa batas" toggle → -1) and one switch per `FEATURE_KEYS` entry, using `LIMIT_META` / `FEATURE_META` labels and hints. Adding a key in code adds a field with no UI work.
- Prices are `numeric(14,2)`; checkout converts to an integer rupiah amount.
- Turning on Pro later is a data change only: set `isActive` and `isPublic` to true at `/admin/plans`.

Public consumers:
- `/api/public/landing` → active + public plans with normalized limits/features (pricing table).
- `/api/app/subscription` → active + public plans for the billing page.

## 8. Downgrade never deletes data

When a workspace falls below a cap (trial expiry, grace expiry, the end of a cancelled period, an admin override), `enforceWorkspaceLimits()` runs (`05` §5):
- Excess **social accounts are disabled** (oldest kept), scheduled targets on them return to draft, and `workspaces.downgradeResolvedAt` is cleared in the same transaction, so the owner gets a **blocking dialog** to pick which accounts stay active.
- Excess **auto-reply rules are paused**; excess **Etalase pages are unpublished**.
- Paid features stop working, but their data and configuration are kept. Everything comes back on upgrade.
- This promise is written into user-facing copy: "Data Anda tidak dihapus."

## 9. Trial guard

- One trial per normalized email via `trial_claims.emailNormalized` (unique), written in the signup transaction, behind setting `billing.oneTrialPerEmail`.
- Trial plan = setting `billing.trialPlanSlug` (`kreator`); its length = that plan's `trialDays` (14).
- A workspace without a trial starts on the `gratis` plan with status `downgraded`.
- During the trial, the shell shows a quiet `<TrialBanner>` ("Uji coba Kreator: 9 hari lagi") with a link to billing. No pop-ups.
