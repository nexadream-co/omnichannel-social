# 13 — Front-end: Creator Console (`/app`) and Shared Client Patterns

Most of this file also applies to `/admin`; differences are noted. The console must follow the simplicity rules in `../ARCHITECTURE.md` §1.1 and the screen brief in `../SCREENS.md`: a first-time creator reaches their first scheduled post in under 5 minutes, without docs.

## 1. The HTTP client — `app/utils/api-fetch.ts`

**Every internal API call uses `apiFetch`, never the bare `$fetch`.** Sessions are HttpOnly cookies, so `apiFetch` does not attach tokens. It exists to centralize three things: 401 handling per audience, mutation topics for cache invalidation, and error extraction. Nuxt's auto-imported `$fetch` is captured from `globalThis.$fetch` at module evaluation, so `apiFetch` resolves its client lazily on first call.

```ts
function audienceFor(url: string): 'creator' | 'staff' | null {
  if (url.startsWith('/api/admin/')) return 'staff'
  if (url.startsWith('/api/app/')) return 'creator'
  return null
}

client = globalThis.$fetch.create({
  credentials: 'same-origin',
  onResponse      → for successful non-GET calls, notify mutation listeners (topic = URL prefix, e.g. '/api/app/posts')
  onResponseError → on 401: reset that audience's auth state (useCreatorAuth / useStaffAuth) and
                    navigate to its login page with ?redirect=<current path>
})
export const apiFetch = Object.assign((req, opts) => client()(req, opts), { raw, create })
export function onApiMutation(listener): () => void
```

Error helpers (`usePageState.ts`): `extractErrorMessage(caught, fallback)` (the Bahasa `statusMessage`), `extractErrorCode(caught)`, `extractStatusCode(caught)`, `extractIssues(caught)` (the `CHANNEL_VALIDATION_FAILED` issue list).

## 2. Auth composables

`useAuthClient(options)` is one internal factory around a better-auth Vue client. `useCreatorAuth()` and `useStaffAuth()` are thin wrappers with their own options:

```ts
interface AuthClientOptions {
  audience: 'creator' | 'staff'
  basePath: string               // '/api/app/auth' | '/api/admin/auth'
  profileEndpoint: string        // '/api/app/me' | '/api/admin/me'
  loginRoute: string             // '/app/auth/login' | '/admin/auth/login'
  homeRoute: string              // '/app' | '/admin/dashboard'
}
```

State is `useState` keyed by audience (`auth:<audience>:profile|workspace|impersonating|ready`), so one instance is shared by every component.

```ts
init()                    // on first client render: GET profileEndpoint (cookie-based); 401 → signed out
signIn({ email, password })                 // better-auth signIn.email
signInWithGoogle(redirect?)                 // better-auth signIn.social({ provider: 'google' }) — creator only
signUp({ name, email, password, acceptTerms })  // creator only → registerOwner (05) via a better-auth hook
signOut(redirect = true)  // better-auth signOut → reset → navigate to loginRoute
fetchProfile()            // failure → reset
hasPermission(key|key[])  // staff; superadmin true
hasAbility(ability)       // creator; canWorkspaceRole
// exposes: profile, workspace (WorkspaceSummary), impersonating, ready, isAuthenticated, emailVerified
```

`GET /api/app/me` returns:

```json
{
  "user": { "id", "name", "email", "emailVerified": true, "image", "phone", "locale": "id",
            "role": "owner", "abilities": ["billing.manage", "..."], "hasPassword": true },
  "workspace": { "id", "name", "slug", "status", "timezone",
                 "onboardingCompletedAt": null, "needsAccountSelection": false },
  "onboarding": { "accountConnected": false, "etalaseCreated": false, "firstLinkAdded": false, "firstPostScheduled": false },
  "displayTimezone": "Asia/Jakarta",
  "impersonating": false
}
```

The profile also sets the display timezone and the active i18n locale (`user.locale`).

## 3. Route guard — `app/middleware/auth.global.ts`

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return                     // both consoles are client-only
  const path = stripLocalePrefix(to.path)            // '/en/app/...' → '/app/...'
  const isCreator = path.startsWith('/app'), isStaff = path.startsWith('/admin')
  if (!isCreator && !isStaff) return
  const isAuthRoute = path.startsWith('/app/auth') || path.startsWith('/admin/auth')

  if (isCreator) {
    const auth = useCreatorAuth(); await auth.init()
    if (isAuthRoute) {
      // accept-invite may be opened while signed in (it's for another membership)
      if (auth.isAuthenticated.value && path !== '/app/auth/accept-invite') return navigateTo(localePath('/app'))
      return
    }
    if (!auth.isAuthenticated.value)
      return navigateTo({ path: localePath('/app/auth/login'), query: path === '/app' ? undefined : { redirect: to.fullPath } })
    // NOT blocking on onboarding (simplicity: the checklist lives on Beranda and never traps the user).
    if (auth.workspace.value?.needsAccountSelection && path !== '/app/accounts')
      return navigateTo(localePath('/app/accounts'))   // the page opens the blocking "Pilih akun yang tetap aktif" dialog
    return
  }

  const auth = useStaffAuth(); await auth.init()
  if (isAuthRoute) { if (auth.isAuthenticated.value) return navigateTo('/admin/dashboard'); return }
  if (!auth.isAuthenticated.value)
    return navigateTo({ path: '/admin/auth/login', query: path === '/admin' ? undefined : { redirect: to.fullPath } })
})
```

Login pages honour `?redirect=` (same-origin paths only). `/admin` is not localized (staff UI is Bahasa only).

## 4. Creator pages (platform part)

Domain pages (compose, calendar, posts, links, Etalase, auto-reply, analytics, accounts) are listed in `../SCREENS.md`. Platform pages:

| Route | Purpose | Ability |
|---|---|---|
| `/app/auth/login` | email + password; "Lanjutkan dengan Google"; explains `?error=` codes | — |
| `/app/auth/register` | name, email, password, accept terms → signed in → Beranda with the checklist | — |
| `/app/auth/verify-email` | "Cek email Anda" + resend + change email | — |
| `/app/auth/forgot-password`, `/reset-password?token=` | | — |
| `/app/auth/accept-invite?token=` | preview then accept; password asked only when the account has no way to sign in | — |
| `/app` (Beranda) | onboarding checklist (until done), today's posts, alerts with fix buttons, clicks this week, trial/grace banners | any |
| `/app/billing` | plans, checkout, pending charges, renewal, cancel — see `07` §3.2 | `billing.manage` |
| `/app/billing/history` | paged payment history | `billing.manage` |
| `/app/team` | members + invitations, role presets (plan feature `teamAccess`) | `team.manage` |
| `/app/settings` | workspace name, timezone, language, notification preferences, data export, deletion request | `settings.manage` (language/notifications: any) |
| `/app/activity` | creator-visible audit trail (plan feature `activityLog`, retention-clamped) | `activity.read` |
| `/app/notifications` | full notification list | any |
| `/app/profile`, `/app/change-password` | separate pages on purpose (different risk) | any |
| `/app/help` | short guides, 30-second videos, WhatsApp support link | any |

**Onboarding checklist (non-blocking).** `useOnboarding()` reads the four flags from `/api/app/me`: (1) Hubungkan akun, (2) Buat Etalase, (3) Tambah produk pertama, (4) Jadwalkan postingan pertama. Each step deep-links to the page that completes it, is skippable, and the checklist celebrates once when all are done (sets `workspaces.onboardingCompletedAt`). It never redirects.

## 5. Shell — `layouts/creator.vue` → `<CreatorShell>`

- **Desktop/tablet left rail** (collapsible, cookie state; `sticky h-dvh`, scrolls independently): logo, `CREATOR_NAV` items filtered by ability, a prominent **"+ Buat Postingan"** button at the top, rail foot = `<UpgradeRailButton>` (hidden when the plan already has every feature or the role can't buy) + help + collapse toggle.
- **Phone:** a **bottom nav** with five entries (Beranda, Kalender, Link Produk, Etalase, Lainnya) plus a floating **"Buat Postingan"** button. "Lainnya" opens a sheet with the remaining nav and account chrome. Every core flow must work one-handed.
- **Top bar** = account chrome only: breadcrumb (desktop), `<NotificationMenu>`, `<UserMenu>`. The user menu is fixed code (not DB), grouped under captions:
  - *Akun*: Profil, Ubah kata sandi
  - *Bisnis*: Langganan (`billing.manage`), Tim (lock icon if plan lacks `teamAccess`), Pengaturan, Log aktivitas (lock icon if plan lacks `activityLog`)
  - *Aplikasi*: Mode gelap, Bahasa (Indonesia / English), Bantuan
  - Keluar
  A caption with no visible rows is not drawn.
- **Banners**: `<ImpersonationBanner>` (always visible while `impersonating`; "Berhenti" → `POST /api/app/auth/stop-impersonation`, back to `/admin`), `<TrialBanner>` (days left / grace deadline / renewal due, link to billing), `<ReconnectBanner>` (any social account in `needs_reauth`, with a "Hubungkan ulang" button).
- **`<UpgradeDialog>`** is mounted once in the shell and driven by `useEntitlements().upgradeDialog`. Any caught 402 opens it with the server message. The tone is friendly and it appears only when a limit is actually hit.
- **Page body**: `<CommandBar>` (title, one primary action; on phones actions wrap to their own row), then content. Create/edit in `<FormSlideover>` (full-screen sheet on phones); `UModal` only for confirmations (`useConfirmDialog()`) and read-only detail.
- Breadcrumbs come from a route catalog (`shared/utils/breadcrumbs.ts`).

`CREATOR_NAV` (code-defined in `shared/utils/menus.ts`):

```ts
export interface CreatorNavItem {
  key: string; labelKey: string; to: string; icon: string
  ability?: WorkspaceAbility     // hides the entry when the role lacks it
  feature?: FeatureKey           // NEVER hides; shows a lock, page opens the upgrade dialog
}
export const CREATOR_NAV: CreatorNavItem[] = [
  { key: 'home',       labelKey: 'nav.home',       to: '/app',            icon: 'i-lucide-house' },           // Beranda
  { key: 'compose',    labelKey: 'nav.compose',    to: '/app/compose',    icon: 'i-lucide-square-pen', ability: 'posts.write' }, // Buat Postingan
  { key: 'calendar',   labelKey: 'nav.calendar',   to: '/app/calendar',   icon: 'i-lucide-calendar' },        // Kalender
  { key: 'posts',      labelKey: 'nav.posts',      to: '/app/posts',      icon: 'i-lucide-list' },            // Postingan
  { key: 'links',      labelKey: 'nav.links',      to: '/app/links',      icon: 'i-lucide-link' },            // Link Produk
  { key: 'bio',        labelKey: 'nav.bio',        to: '/app/bio',        icon: 'i-lucide-store' },           // Etalase
  { key: 'autoReply',  labelKey: 'nav.autoReply',  to: '/app/auto-reply', icon: 'i-lucide-message-circle-reply' }, // Balas Otomatis
  { key: 'analytics',  labelKey: 'nav.analytics',  to: '/app/analytics',  icon: 'i-lucide-chart-column' },    // Statistik
  { key: 'accounts',   labelKey: 'nav.accounts',   to: '/app/accounts',   icon: 'i-lucide-at-sign' }          // Akun Sosial
]
```

## 6. Shared composables

| Composable | Shape | Notes |
|---|---|---|
| `useCreatorAuth` / `useStaffAuth` | see §2 | `useState` |
| `useEntitlements` | features / limits / usage, `handlePlanError` | `useState`; fetched once per page load (`06` §6) |
| `useNotifications` | items, unreadCount, markRead, markAllRead | shared by bell + page |
| `useOnboarding` | steps, done, next step | reads `/api/app/me` |
| `usePageState(loader, { isEmpty, immediate })` | `data, status: idle\|loading\|error\|empty\|success, execute/refresh` | feeds `<AppLoadingState>`, `<AppErrorState>`, `<AppEmptyState>` |
| `useServerList<T>(endpoint, { limit, filters, immediate, debounceMs, cache })` | `items, page, limit, search, total, pageCount, extra, status, refresh` | server pagination; 300 ms debounced search; filter change resets to page 1; cache invalidated by mutation topics |
| `useConfirmDialog` | `confirm({ title, description, confirmLabel, color }) → Promise<boolean>` | one modal instance |
| `useAdminImpersonation` | start/stop impersonation | the only code that starts/stops it (`03`) |
| `useDisplayTimezone` | the clock dates render on | set from the profile |

## 7. Conventions (MUST)

**Language.** Every visible string comes from i18n locale files (`id` default, `en` secondary): labels, toasts, empty states, badges. Never render an enum slug: every enum has a label map in `shared/utils/status.ts` (with i18n keys and a colour), and one component (`<StatusBadge>`) renders it.

```ts
export const SUBSCRIPTION_STATUS_META = {
  trialing:   { labelKey: 'status.subscription.trialing',   color: 'info' },     // Masa coba
  active:     { labelKey: 'status.subscription.active',     color: 'success' },  // Aktif
  past_due:   { labelKey: 'status.subscription.past_due',   color: 'warning' },  // Menunggu pembayaran
  cancelled:  { labelKey: 'status.subscription.cancelled',  color: 'neutral' },  // Dibatalkan
  downgraded: { labelKey: 'status.subscription.downgraded', color: 'neutral' },  // Paket Gratis
  suspended:  { labelKey: 'status.subscription.suspended',  color: 'error' }     // Ditangguhkan
}
// POST_TARGET_STATUS_META (Draf, Terjadwal, Diproses, Terbit, Gagal…), SOCIAL_ACCOUNT_STATUS_META,
// PAYMENT_STATUS_META, WORKSPACE_ROLE_META, AUDIT_ACTION_LABELS, PLATFORM_META (name, icon, colour) …
```

**Plain words.** Never show "webhook", "token", "API", "container", "slug", "UTM", "OAuth" to creators. Advanced options stay behind "Opsi lanjutan".

**Formatting** (`app/utils/format.ts`, locale-aware, default `id-ID` and `Asia/Jakarta`): `formatIDR` → `Rp 25.000`; `formatDate` → `11 Agustus 2026`; `formatDateTime` → `11 Agustus 2026, 14.30`; `formatRelative` → `2 jam lalu`; `formatCompact` → `12,4 rb` (views, clicks). Month and day names from `Intl`, never hard-coded.

**Design system.** Nuxt UI v4 components; tokens in `main.css` (`@theme`) and `app.config.ts`. Small radii, restrained elevation, 100–200 ms ease-out motion. **Dark mode is required** (default light; choice persisted). Every colour from semantic tokens (`bg-default`, `bg-muted`, `text-muted`, `ring-default`…), never a hex. Platform brand colours (Instagram, Threads, Facebook) only inside `PLATFORM_META` badges.

**Responsive, phone first**: phone (< 640, bottom nav), tablet (≥ 1024, two-pane where useful, e.g. composer + preview), desktop (≥ 1280, persistent rail). A capped-width page body (`max-w-4xl`) always has `mx-auto`.

**Nuxt UI pitfalls.** `UTable` row select handler's row is the **second** argument: `@select="(_e, row) => …"`. A `USelectMenu` option may never have `value: ''`; use sentinel constants. A literal `{{token}}` in a Vue template breaks the parser; build the braces in script. A focus ring utility without `focus-visible:` draws permanently.

**Rendering performance** (target: a mid-range Android phone on mobile data):
- State read by more than one component lives in a `useState`-backed composable, never a `ref` prop-drilled from a parent.
- Fetch once: guard loaders with a `loaded` flag.
- Derive with `computed`; `shallowRef` for big immutable payloads (calendar windows, analytics series); stable `:key`.
- Debounce server-hitting input at 300 ms.
- Lazy-load heavy chunks (calendar drag-and-drop, charts, rich text, media cropper).
- Media upload shows progress and survives navigation inside the composer.

## 8. Optional: installable console (PWA)

Worth doing for phone-first creators, after v1:
- Manifest as a server route, `scope: '/app/'`, `start_url: '/app'`, `id: '/app/'` (**never change the id**).
- Service worker caches hashed `/_nuxt/` assets only — not navigations, not `/api/**`.
- Capture `beforeinstallprompt` in a client plugin (module variable, not `useState`); iOS gets manual instructions.
- No web push in v1 (see README: push is out of scope).
