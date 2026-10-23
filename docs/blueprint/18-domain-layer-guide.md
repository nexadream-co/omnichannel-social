# 18 — Adding Socialz.id Domain Features

The platform layer (files 01–17) is the foundation. This file explains how Socialz.id's own features are built **on top of it** without breaking tenancy, RBAC, plans or the UI conventions. The domain design itself (channel adapters, publishing pipeline, short links, Etalase, auto-reply) lives in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## 1. Domain modules

| Module | Core path | Tables (ARCHITECTURE §7) | Abilities | Plan keys |
|---|---|---|---|---|
| Social accounts | `server/core/channels/`, `server/core/social-accounts.ts` | `social_accounts` | `accounts.manage` (connect/disconnect), `posts.read` (list) | `socialAccounts` |
| Media | `server/core/media/` | `media_assets` | `media.manage` | `mediaStorageMb` |
| Publishing | `server/core/publishing/` | `posts`, `post_media`, `post_targets`, `publish_attempts`, `platform_publish_ledger`, `insight_snapshots` | `posts.read`, `posts.write` | `scheduledPostsPerMonth` |
| Links | `server/core/links/` | `links`, `short_links`, `link_clicks` | `links.manage`, `analytics.read` | `clickRetentionDays`, feature `customSlug`, `analyticsExport` |
| Etalase | `server/core/bio/` | `bio_pages`, `bio_categories`, `bio_items` | `bio.manage` | `bioPages`, feature `removeBranding` |
| Auto-reply | `server/core/autoreply/` | `dm_rules`, `dm_events`, `webhook_events` | `autoreply.manage` | `autoReplyRules`, `autoReplyDmsPerMonth` |
| Hashtags | `server/core/hashtags/`, `shared/hashtags/` | `hashtag_library` (global), `hashtag_sets`, `hashtag_research_runs`, `hashtag_signals` (global cache) | `posts.read`, `posts.write`; staff `hashtags.read` / `hashtags.write` | `tagResearchPerMonth` |
| Content planner | `server/core/planner/`, `shared/utils/planner.ts` | `content_ideas`, `content_idea_links`, `content_idea_media`, `shopping_moments` (global); `posts.pillar`, `workspaces.posts_per_week` | `posts.read`, `posts.write`; staff `moments.read` / `moments.write` | none (free on every plan) |

## 2. Recipe for a domain feature

Example: adding "saved caption templates" (`caption_templates`).

1. **Schema** in `server/core/db/schema/<module>.ts`:
   - `workspaceId` on **every** row; index `workspaceId`, FKs, `(workspaceId, createdAt)` and anything filtered or sorted on.
   - Composite FK `(workspaceId, parentId)` when the row hangs off another tenant row.
   - uuidv7 ids; `createdAt` / `updatedAt`; English `pgEnum` values with label maps added to `shared/utils/status.ts`.
   - Rows that history points at have no hard-delete path. Use `isActive` / `archived` / `status` instead.
   - `drizzle-kit generate`; write partial unique indexes by hand in the SQL when needed.
2. **Catalog** in `shared/utils/<module>.ts`: enum lists, labels, icons and constants shared by server and client. Social channel rules belong in `shared/channels/` capabilities, never hard-coded in a page.
3. **Abilities:** reuse an existing one when possible. Add one only if none can express the rule; extend `WorkspaceAbility` and the three role arrays, and update the preset sentences. Never build a per-user matrix.
4. **Plan gates:** if the feature is sold, add a `FEATURE_KEYS` and/or `LIMIT_KEYS` entry with `FEATURE_META` / `LIMIT_META` labels and conservative defaults. Set values per plan in the seed **and** a migration. Choose refuse (402), clamp, or degrade silently (`06`), and record the choice in the gate table.
5. **Core module** `server/core/<module>.ts`. It takes `ctx`, never an `H3Event`:

   ```ts
   export const captionTemplateSchema = z.object({
     name: z.string().trim().min(2, 'Nama templat minimal 2 huruf'),
     body: z.string().trim().min(1, 'Isi templat tidak boleh kosong').max(2200, 'Maksimal 2.200 karakter')
   })

   export async function listCaptionTemplates(ctx: WorkspaceContext, query: ListQuery) {
     assertAbility(ctx, 'posts.read')
     const where = and(eq(captionTemplates.workspaceId, ctx.workspaceId), searchFilter(query))
     const [items, [{ total }]] = await Promise.all([
       db.select().from(captionTemplates).where(where).orderBy(desc(captionTemplates.createdAt)).limit(query.limit).offset(query.skip),
       db.select({ total: count() }).from(captionTemplates).where(where)
     ])
     return { items: items.map(toView), total }
   }

   export async function createCaptionTemplate(ctx: WorkspaceContext, input: z.infer<typeof captionTemplateSchema>) {
     assertAbility(ctx, 'posts.write')                         // role first (403)
     await requireEntitlement(ctx, 'captionTemplates')         // then plan, if sold (402)
     const row = await db.transaction(async (tx) => { /* one fact */ })
     await recordAudit(ctx, { action: 'caption_template.create', targetType: 'caption_template', targetId: row.id })
     return toView(row)
   }
   ```

   - `toView()` maps DB rows to the wire shape: numerics as numbers via `toAmount`, dates ISO, never internal columns, **never tokens**.
   - Anything that calls a social platform goes through a **channel adapter** (`ARCHITECTURE` §6). Platform vocabulary (Graph fields, error codes) never leaks into core modules or pages.
   - Slow or external work (publishing, media, DMs, insights) is **enqueued as a job row** from core, in the same transaction as the write that justifies it, and kicked after commit when it is urgent (`15`). Never do slow work inline in a request, and never start a timer.
6. **Handlers** in `/api/app/<module>/**`, each a few lines over the core function. Admin read-only drill-downs go under `/api/admin/workspaces/:id/<module>` behind `workspaces.read`.
7. **UI** page under `/app/<module>`:
   - an entry in `CREATOR_NAV` (with `ability`, and `feature` if paid), a breadcrumb catalog entry, Bahasa + English locale keys;
   - **simple by default**: one primary action, smart defaults, advanced options behind "Opsi lanjutan", an empty state that teaches the next step;
   - `<CommandBar>`, `useServerList` (server pagination, debounced search), `<FormSlideover>` for create/edit, `useConfirmDialog` for destructive actions, `<StatusBadge>` for enums;
   - `handlePlanError` on every write;
   - loading / empty / error states; light + dark; phone first.
8. **Notifications:** new template keys in `templates.ts` (+ migration insert); send through `createNotification` after commits, batched where a burst is likely (e.g. many failed posts).
9. **Account export:** add the module's tables to `exportWorkspaceData` (tokens excluded).
10. **Tests:** unit tests for pure rules (validators, matchers, state transitions); integration tests for core functions against real Postgres; adapter tests with recorded fixtures.
11. **Changelog** and version bump.

## 3. Domain rules worth keeping

- **Speed is a feature.** The most frequent actions (schedule a post, add a product link) must take seconds. One request boots the screen, everything optional is optional, and details can be filled in later.
- **The app fixes things for the user.** Auto-convert media, pre-fill from a pasted URL, suggest a time. Validate with the channel capabilities **before** scheduling, not after a failed publish.
- **Record, don't destroy.** Published posts, clicks, DM events and publish attempts are history. They are archived or excluded, never deleted (except retention purges and data-deletion requests).
- **The DB is the source of truth for anything retried** (publishing, DMs, payments): idempotency keys and unique constraints (`dm_events (social_account_id, comment_id)`, `webhook_events (provider, dedupe_key)`, `payments.order_id`) make retries safe.
- **Ledgers, not drifting counters.** Monthly usage (`scheduledPostsPerMonth`, `autoReplyDmsPerMonth`) is counted from rows or from `usage_counters` updated only by the one function that performs the action, in the same transaction.
- **Big lists are never shipped in a bootstrap payload.** Search server-side, debounced, after 2 characters or more.
- **Local days are cut on the workspace clock in SQL** with `(col AT TIME ZONE 'UTC') AT TIME ZONE tz`.
- **Gated reads clamp, gated writes refuse, downgrades keep data.**
- **Out of scope stays out.** The deliberately unbuilt features are listed in the root `CLAUDE.md`, so nobody half-builds them by accident.

## 4. What must not change when adding domain code

- The gatekeepers, error codes and entitlement module APIs.
- The subscription state machine and the payment path.
- The channel adapter contract (extend it with optional methods only).
- The publish state machine (`ARCHITECTURE` §8.2).
- The language policy and label-map pattern.
- The rule that request handlers and job handlers share one core function per capability.
- The serverless runtime contract (`19` §2).
