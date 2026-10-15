# 04 — Authorization (RBAC)

There are **two distinct systems**. Do not merge them.

| | Platform RBAC (`/admin`) | Workspace RBAC (`/app`) |
|---|---|---|
| Who | Socialz.id staff | People inside a creator's workspace |
| Model | `staff_users → roles → role_permissions → permissions` (DB) | `workspace_members.role` enum + code-defined abilities |
| Granularity | dotted permission keys, editable per role in `/admin/roles` | three fixed role presets, **no** per-user permission matrix |
| Check | `requirePermission(event, key)` / `<Can :permission>` | `assertAbility(ctx, ability)` / `canWorkspaceRole(role, ability)` |
| Sidebar | DB-driven `menus` tree, pruned by permission | code-defined `CREATOR_NAV`, filtered by ability |

And separately from both: **plan entitlements** (what the workspace *paid for*), see `06-plans-and-entitlements.md`. Role = 403, plan = 402.

---

## 1. Platform RBAC

### 1.1 Permission catalog — `shared/utils/permissions.ts`

A typed catalog mirroring what the seed writes, so every check is checked at compile time:

```ts
export const PERMISSIONS = {
  'dashboard': { read: 'dashboard.read' },
  'workspaces': { read: 'workspaces.read', write: 'workspaces.write' },
  'subscriptions': { read: 'subscriptions.read', write: 'subscriptions.write' },
  'plans': { read: 'plans.read', write: 'plans.write' },
  'payments': { read: 'payments.read', write: 'payments.write' },
  'staff': { read: 'staff.read', write: 'staff.write' },
  'roles': { read: 'roles.read', write: 'roles.write' },
  'permissions': { read: 'permissions.read', write: 'permissions.write' },
  'menus': { read: 'menus.read', write: 'menus.write' },
  'settings': { read: 'settings.read', write: 'settings.write' },
  'pages': { read: 'pages.read', write: 'pages.write' },
  'faq': { read: 'faq.read', write: 'faq.write' },
  'messages': { read: 'messages.read', write: 'messages.write' },
  'email-templates': { read: 'email-templates.read', write: 'email-templates.write' },
  'notification-templates': { read: 'notification-templates.read', write: 'notification-templates.write' },
  'reports': { read: 'reports.read' },                                   // read-only; carries revenue
  'publishing': { read: 'publishing.read', write: 'publishing.write' },  // failed posts, retry, queue health
  'channels': { read: 'channels.read', write: 'channels.write' },        // social account health, auto-reply kill switch
  'links': { read: 'links.read', write: 'links.write' }                  // moderation: disable short links / Etalase handles
} as const

export type PermissionKey = /* union of every leaf value */
export const PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS).flatMap(g => Object.values(g))
export const PERMISSION_GROUP_LABELS: Record<group, string>   // Bahasa labels, e.g. workspaces: 'Ruang kerja kreator'
export const PERMISSION_ACTION_LABELS = { read: 'Lihat', write: 'Ubah' }
```

Seed: one `permissions` row per key, `group` = prefix, `description` built from the action label + group label.

### 1.2 Roles

| Slug | `isSuperAdmin` | Permissions |
|---|---|---|
| `superadmin` | ✓ | all (and bypasses every `requirePermission`) |
| `admin` | | all except `roles.write`, `permissions.write`, `menus.write` (cannot widen own access) |
| `support` | | every `*.read` except `reports.read`, plus `messages.write` and `publishing.write` (retry a creator's failed post) |

All three are `isSystem: true`. Rules enforced by the API:
- `isSystem` roles cannot be deleted; their `slug` cannot change.
- The superadmin role's permissions cannot be edited (409).
- A role with staff users cannot be deleted (409 "Pindahkan staf di peran ini terlebih dahulu.").
- Editing a role's permissions replaces its `role_permissions` set inside a transaction, ignores unknown keys, and writes audit `permission.update`.

`roles.isSuperAdmin` gates impersonation, hard workspace actions (soft delete), the global auto-reply kill switch, and is the only role allowed to create other superadmins.

### 1.3 DB-driven sidebar — `menus`

- Self-referential tree, deterministic ids `menu-{slug}`.
- `parentId === null && path === null` → **section header**.
- An item with children and no `path` → **disclosure group** (third level). **Max depth 3.** The menu editor must render every level it allows, because the self-relation cascades on delete.
- A group carries no `permissionKey`; its children gate themselves.
- `GET /api/admin/menus` returns the tree pruned to the caller:

  ```ts
  const allowed = (key: string | null) => !key || isSuperAdmin || permissions.has(key)
  function build(parentId) {
    return rows(parentId)
      .filter(r => allowed(r.permissionKey))
      .map(r => ({ id, label, slug, path, icon, children: build(r.id) }))
      .filter(n => n.path !== null || n.children.length > 0)   // drop empty groups
  }
  ```

- Fixed chrome (not DB rows): Dashboard, Laporan (if `reports.read`), notifications, profile, change password, logout.
- The open/closed state of a disclosure group is a single `useState` boolean (the rail is mounted twice: desktop aside and mobile drawer). Landing on a page inside a group *writes* that state open; never compute it as `open || containsCurrentPage` (that makes the toggle stop working).

Default tree (`shared/utils/menus.ts` → `MENU_TREE`):

```
Bisnis (business)
  Ruang kerja         /admin/workspaces            workspaces.read
  Langganan           /admin/subscriptions         subscriptions.read
  Paket               /admin/plans                 plans.read
  Pembayaran          /admin/payments              payments.read
  Payment gateway     /admin/payment-gateways      payments.write
  Payment callback    /admin/webhook-events        payments.read
Operasional (operations)
  Postingan gagal     /admin/publish-failures      publishing.read
  Kesehatan akun sosial /admin/social-accounts     channels.read
  Moderasi link & Etalase /admin/links             links.read
  Meta webhook        /admin/meta-webhooks         channels.read
Konten (content)
  Halaman             /admin/pages                 pages.read
  FAQ                 /admin/faq                   faq.read
  Pesan masuk         /admin/messages              messages.read
  Templat email       /admin/email-templates       email-templates.read
  Templat notifikasi  /admin/notification-templates notification-templates.read
Akses (access)
  Pengguna (group)
    Staf              /admin/staff                 staff.read
    Pengguna kreator  /admin/users                 workspaces.read
  Peran               /admin/roles                 roles.read
  Hak akses           /admin/permissions           permissions.read
  Menu                /admin/menus                 menus.read
Sistem (system)
  Pengaturan          /admin/settings              settings.read
  Log aktivitas       /admin/audit-logs            settings.read
  Antrean pekerjaan   /admin/system/jobs           settings.read
```

Menu admin endpoints: `GET/POST /api/admin/menus/manage`, `PATCH/DELETE /api/admin/menus/manage/:id` (delete refused while it has children), `POST /api/admin/menus/manage/reorder { items: [{ id, order, parentId }] }` (one transaction).

### 1.4 Client

- `useStaffAuth().hasPermission(key | key[])`: superadmin is always true.
- `<Can :permission="PERMISSIONS.workspaces.write">…</Can>` hides UI. The server check is the boundary; the component is a convenience.

---

## 2. Workspace RBAC — deliberately small

### 2.1 Roles and abilities — `shared/utils/workspace-abilities.ts`

Imported identically by server and client.

```ts
export type WorkspaceRoleSlug = 'owner' | 'editor' | 'viewer'

export type WorkspaceAbility =
  | 'billing.manage'      // subscription, checkout, payments
  | 'settings.manage'     // workspace settings, onboarding profile
  | 'account.manage'      // data export, deletion request
  | 'team.manage'         // invite / deactivate members
  | 'activity.read'       // workspace-visible audit trail
  | 'accounts.manage'     // connect / reconnect / disconnect social accounts
  | 'posts.read'
  | 'posts.write'         // compose, schedule, publish now, retry, cancel
  | 'media.manage'        // upload / delete media library items
  | 'links.manage'        // product links + short links
  | 'bio.manage'          // Etalase editor
  | 'autoreply.manage'    // Balas Otomatis rules
  | 'analytics.read'      // Statistik

const ALL: WorkspaceAbility[] = [/* every value above */]

const ABILITIES: Record<WorkspaceRoleSlug, WorkspaceAbility[]> = {
  owner:  ALL,
  editor: ['posts.read', 'posts.write', 'media.manage', 'links.manage', 'bio.manage', 'autoreply.manage', 'analytics.read'],
  viewer: ['posts.read', 'analytics.read']
}

export function canWorkspaceRole(role: WorkspaceRoleSlug | 'system', ability: WorkspaceAbility): boolean
// 'system' (job context) returns true for every ability

export function abilitiesFor(role): WorkspaceAbility[]

export const WORKSPACE_ROLE_PRESETS = {
  owner:  { label: 'Pemilik',  summary: 'Akses penuh, termasuk akun media sosial, langganan dan pembayaran.', icon: 'i-lucide-crown' },
  editor: { label: 'Editor',   summary: 'Membuat dan menjadwalkan postingan, mengelola link produk, Etalase dan Balas Otomatis. Tidak bisa mengubah langganan atau akun media sosial.', icon: 'i-lucide-pen-line' },
  viewer: { label: 'Pemantau', summary: 'Hanya melihat postingan dan statistik.', icon: 'i-lucide-eye' }
}

export const ASSIGNABLE_WORKSPACE_ROLES: WorkspaceRoleSlug[] = ['editor', 'viewer']
```

Rules:
- **Owner**: exactly one per workspace, created with the workspace at signup. Not assignable and not editable from the team page. Ownership transfer is a separate, deliberate feature (not built).
- **Presets, never a permission matrix.** The invite form shows one card per role with its plain-language sentence. If per-member exceptions are ever needed, add an **additive** `abilityOverrides` JSON column. Never subtractive, and never covering `billing.manage` or `accounts.manage`.
- `accounts.manage` stays owner-only: connecting a social account hands Socialz.id a token for someone's personal Instagram, so it must be the account holder's decision.
- `activity.read` stays owner-only.
- Name the function `canWorkspaceRole`, not `can`, because the entitlements module exports `can(workspaceId, feature)` and both may be imported together.
- For solo creators (most users) the role is always `owner` and none of this is visible. The team page itself is gated by the plan feature `teamAccess` (`06`).

### 2.2 Client

- `useCreatorAuth().hasAbility(ability)` uses the same `canWorkspaceRole` function.
- `CREATOR_NAV` (code-defined, small, stable):

  ```ts
  export interface CreatorNavItem {
    label: string; to: string; icon: string
    ability?: WorkspaceAbility   // hides the entry when the role lacks it
    feature?: FeatureKey         // NEVER hides; shows a lock, the page opens the upgrade dialog
  }

  export const CREATOR_NAV: CreatorNavItem[] = [
    { label: 'Beranda',         to: '/app',           icon: 'i-lucide-house' },
    { label: 'Buat Postingan',  to: '/app/compose',   icon: 'i-lucide-square-pen', ability: 'posts.write' },
    { label: 'Kalender',        to: '/app/calendar',  icon: 'i-lucide-calendar',   ability: 'posts.read' },
    { label: 'Postingan',       to: '/app/posts',     icon: 'i-lucide-list',       ability: 'posts.read' },
    { label: 'Link Produk',     to: '/app/links',     icon: 'i-lucide-link',       ability: 'links.manage' },
    { label: 'Etalase',         to: '/app/bio',       icon: 'i-lucide-store',      ability: 'bio.manage' },
    { label: 'Balas Otomatis',  to: '/app/auto-reply',icon: 'i-lucide-message-circle-reply', ability: 'autoreply.manage' },
    { label: 'Statistik',       to: '/app/analytics', icon: 'i-lucide-chart-column', ability: 'analytics.read' },
    { label: 'Akun',            to: '/app/accounts',  icon: 'i-lucide-at-sign',    ability: 'accounts.manage' },
    { label: 'Tim',             to: '/app/team',      icon: 'i-lucide-users',      ability: 'team.manage', feature: 'teamAccess' }
  ]
  ```

  Billing, settings, activity and profile are **account chrome** in the user menu, not rail entries.

---

## 3. Gatekeeper decision table

| Situation | Use | Status |
|---|---|---|
| No / invalid session | any `require*` | 401 `UNAUTHENTICATED` |
| Staff lacks permission | `requirePermission` | 403 `FORBIDDEN` |
| Workspace role lacks ability | `assertAbility` | 403 `FORBIDDEN` |
| Impersonated session tries to pay or connect an account | `requireNotImpersonating` | 403 `FORBIDDEN` |
| Email not verified, trying to connect a social account | `requireVerifiedEmail` | 403 `EMAIL_NOT_VERIFIED` |
| Resource of another workspace | core query scoped by `workspaceId` | 404 `NOT_FOUND` |
| Plan lacks feature | `requireEntitlement` | 402 `PLAN_REQUIRED` |
| Plan cap reached | `assertWithinLimit` | 402 `LIMIT_REACHED` |
| Workspace suspended | `requireWorkspaceContext` | 403 `WORKSPACE_SUSPENDED` |
| Workspace deleted | `requireWorkspaceContext` | 403 `WORKSPACE_DELETED` |

Order inside a core function: **role check first, then plan check**, so a viewer gets 403 rather than being shown an upgrade offer they can't act on.

A resource that belongs to another workspace always answers **404, not 403**, so an id guessed from a URL reveals nothing.
