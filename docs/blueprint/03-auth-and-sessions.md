# 03 — Authentication & Sessions

## 1. Two audiences, never interchangeable

| | Creator (customers) | Staff (Socialz.id team) |
|---|---|---|
| better-auth instance | `creatorAuth` | `staffAuth` |
| basePath | `/api/app/auth` | `/api/admin/auth` |
| Cookie prefix | `socialz` | `socialz_staff` |
| Tables | `users`, `sessions`, `accounts`, `verifications` | `staff_users`, `staff_sessions`, `staff_accounts`, `staff_verifications` |
| Pages | `/app/auth/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/accept-invite` | `/admin/auth/login`, `/forgot-password`, `/reset-password`, `/accept-invite`. **No public registration** |
| Sign-in methods | email + password, Google | email + password only |
| Guard rejects | a staff cookie on `/api/app/**` → 401 (cookies don't match) | a creator cookie on `/api/admin/**` → 401 |
| Landing after login | `/app` (home, with the onboarding checklist until done) | `/admin/dashboard` |

Sessions are **database sessions in HttpOnly, Secure, SameSite=Lax cookies**. There are no bearer tokens, nothing in `localStorage`, and no token ever travels in a URL. That is why the generic blueprint's OAuth handoff code (`AuthHandoff`) does not exist here. The two instances use different cookie names and different tables, so a session from one audience can never be read by the other.

Because there is no mobile app, there is no `/api/v1` sign-in, no refresh endpoint and no native ID-token sign-in.

## 2. The auth facade (adapter layer)

**No handler, page or composable may know that better-auth is underneath.** Swapping the library, or adding WhatsApp OTP later, must mean editing the adapter files and one registry line.

```
server/core/services/auth/
  types.ts      contracts (below)
  index.ts      facade — the ONLY import site for business code
  creator.ts    better-auth instance for creators (email+password, Google, email verification)
  staff.ts      better-auth instance for staff (email+password, invitations)
```

### Contracts (`types.ts`)

```ts
export type Audience = 'creator' | 'staff'

export interface SessionInfo {
  sessionId: string
  userId: string
  audience: Audience
  activeWorkspaceId: string | null   // creator only
  impersonatedBy: string | null      // staff id when a superadmin is impersonating
  expiresAt: Date
}

export interface AuthUser {          // "who am I" for both audiences
  id: string; name: string; email: string; phone: string | null; image: string | null
  audience: Audience
  emailVerified: boolean
  role?: { id: string, slug: string, name: string, isSuperAdmin: boolean }   // staff
  permissions?: string[]                                                     // staff
  workspaceRole?: 'owner' | 'editor' | 'viewer'                              // creator
  abilities?: string[]                                                       // creator
  hasPassword: boolean    // false = Google-only account → offer "buat kata sandi"
}
```

### Facade exports (`index.ts`)

```ts
readSession(headers, audience): Promise<SessionInfo | null>     // wraps auth.api.getSession
loadAuthUser(userId, audience): Promise<AuthUser | null>
revokeSession(sessionId, audience): Promise<void>
revokeAllSessions(userId, audience): Promise<void>              // after password change, deactivation
createImpersonationSession(input): Promise<{ setCookie: string }>   // §10
availableSocialProviders(): ('google')[]                         // empty when GOOGLE_CLIENT_ID is unset
hashPassword / verifyPassword                                    // re-exported from better-auth's helpers
```

The Nitro catch-all handlers mount the instances:

```ts
// server/api/app/auth/[...all].ts
export default defineEventHandler(event => creatorAuth.handler(toWebRequest(event)))
// server/api/admin/auth/[...all].ts
export default defineEventHandler(event => staffAuth.handler(toWebRequest(event)))
```

### Instance configuration (both)

- `database: drizzleAdapter(db, { provider: 'pg', schema })`, with `modelName` overrides so the staff instance uses the `staff_*` tables.
- `secret: env.BETTER_AUTH_SECRET`. In production a missing secret **throws at boot**; never sign with a default.
- `advanced: { cookiePrefix, useSecureCookies: env.isProduction, generateId: () => uuidv7() }`.
- `session: { expiresIn: 30 days, updateAge: 1 day }` for creators; `expiresIn: 7 days` for staff.
- `user.additionalFields` for `phone`, `isActive`, `locale`, `lastLoginAt`, `lastSeenAt` (creator) and `roleId`, `phone`, `isActive`, `lastLoginAt`, `lastSeenAt` (staff). Extra session field `activeWorkspaceId` (creator) and `impersonatedBy` (both).
- `emailAndPassword: { enabled: true, minPasswordLength: 8, sendResetPassword }`. The reset email goes through `sendTemplatedEmail('password_reset', …)` (`11`), never a library mailer.
- `rateLimit: { enabled: true, storage: 'memory' }` plus our own limits (§8).
- `databaseHooks.session.create.before`: refuse when `users.isActive = false` (401 "Email atau kata sandi salah."). For creators, also pin `activeWorkspaceId` (§3).
- The creator instance only: `socialProviders.google` (when configured) and `emailVerification` (§4). The staff instance: `disableSignUp: true` (accounts are created by invitation only).

### Credentials rules

- An unknown email, an inactive user, an account with **no password on file** (Google-only), or a wrong password all return the *same* 401 "Email atau kata sandi salah." No account enumeration, and no leak of how someone signs in.
- Emails are trimmed and lowercased before every lookup.
- Password hashes are never selected into a response; only `hasPassword: boolean` is exposed.

## 3. Server gatekeepers (`server/utils/auth.ts`)

Every API handler resolves exactly one context with one of these. Core functions then receive the context object (never the event).

```ts
requireCreatorSession(event)        // 401 → { session, user } — for routes that work before a workspace is known
requireWorkspaceContext(event)      // 401 / 403 → WorkspaceContext (below)
requireStaffContext(event)          // 401 / 403 → { user, permissions: Set, isSuperAdmin, impersonatorId, session }
requirePermission(event, key)       // 403; superadmin bypasses; key is a typed PermissionKey
requireSuperAdmin(event)            // 403
requireImpersonator(event)          // superadmin AND not already impersonating
requireNotImpersonating(ctx)        // 403 — billing writes
tryGetCreatorSession(event)         // non-throwing, for anonymous-safe endpoints (e.g. landing CTA state)
```

```ts
export interface WorkspaceContext {
  user: AuthUser
  workspace: Workspace & { subscription: Subscription & { plan: Plan } }
  membership: WorkspaceMember
  workspaceId: string
  role: 'owner' | 'editor' | 'viewer' | 'system'   // 'system' only from systemContext() in a job handler
  impersonatorId: string | null
}
```

Core-side assertions (in `server/core/*`, take the context, not the event):

```ts
assertAbility(ctx, ability)                  // 403 FORBIDDEN — workspace RBAC (04)
requireEntitlement(ctx, feature)             // 402 PLAN_REQUIRED (06)
assertWithinLimit(workspaceId, key, count)   // 402 LIMIT_REACHED (06)
requireVerifiedEmail(ctx)                    // 403 EMAIL_NOT_VERIFIED — before connecting social accounts (§4)
systemContext(workspaceId)                   // job handlers only: role 'system', passes assertAbility
```

`requireWorkspaceContext` checks, in order:

1. Creator session present → else 401 `UNAUTHENTICATED`.
2. `users` row exists and `isActive` → else 401.
3. Active membership in `session.activeWorkspaceId` (or the oldest active membership when null; then the session is updated) → else 403 with `noActiveMembershipMessage()`.
4. Workspace exists; `deletedAt` set → 403 `WORKSPACE_DELETED`; `status = 'suspended'` → 403 `WORKSPACE_SUSPENDED`.
5. Load subscription + plan.
6. Cache on `event.context.workspaceContext`; `touchLastSeen('creator', userId)` (never awaited).

`noActiveMembershipMessage(userId)` distinguishes "never joined any workspace" from "deactivated by the owner of <workspace name>, please contact them".

Error convention everywhere:

```ts
throw createError({
  statusCode: 402,
  statusMessage: '<kalimat dalam Bahasa Indonesia — ditampilkan apa adanya>',
  data: { code: 'LIMIT_REACHED', /* machine details */ }
})
```

## 4. Creator sign-up and email verification

`POST /api/app/register` calls `registerCreator()` (see `05-tenancy-and-onboarding.md` §2). It creates the user through `creatorAuth.api.signUpEmail` **and** the workspace, membership and subscription in one flow, then returns with the session cookie set. The user lands on `/app` with the onboarding checklist.

Email verification:
- `emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true, sendVerificationEmail }`. The email uses template `verify_email` with a link to `/app/auth/verify-email?token=…`.
- `requireEmailVerification` is **off** for sign-in. A new creator can explore the app, write drafts and build their Etalase right away (simplicity principle).
- **Connecting a social account requires a verified email** (`requireVerifiedEmail(ctx)` in `server/core/channels/connect.ts`). The UI shows a friendly banner: "Verifikasi email Anda dulu untuk menghubungkan akun media sosial." with a [Kirim ulang email] button.
- Google sign-ups arrive verified (Google vouches for the address).

## 5. Google sign-in (creators only)

better-auth's Google provider handles state, PKCE and the code exchange. The callback URL is `${SITE_URL}/api/app/auth/callback/google`. No handoff code is needed, because the session cookie is set on the callback response and the browser is redirected to `/app`.

Account linking rules (`account.accountLinking`):
1. A known `(providerId='google', accountId)` → that user. Inactive → refused with the same generic message.
2. The Google profile email matches an existing `users` row **and Google says it is verified** → link a new `accounts` row to it. **Unverified emails must never link**, because that would let someone walk into another creator's workspace. Configure `trustedProviders: ['google']` and keep `allowDifferentEmails: false`.
3. Nobody matches → a new user. A `databaseHooks.user.create.after` hook calls `provisionWorkspace(userId, { viaOAuth: true })` (the same function `registerCreator` uses), so every creator always has a workspace.

Errors on the callback are reduced to a short code in the redirect (`/app/auth/login?error=cancelled|unavailable|account_inactive`), and the login page explains each one in Bahasa. When `GOOGLE_CLIENT_ID` is empty, the Google button is hidden.

## 6. Password reset (both audiences)

- `POST <basePath>/forget-password` **always answers success** (no enumeration). If the account exists and is active, better-auth stores a token in `verifications` and our `sendResetPassword` callback sends template `password_reset` with `resetUrl` (`/app/auth/reset-password?token=…` or `/admin/auth/reset-password?token=…`). Token lifetime: 2 hours (`resetPasswordTokenExpiresIn: 7200`).
- `POST <basePath>/reset-password` sets the new password. Then `revokeAllSessions(userId)` signs out every other device, and an audit row `auth.password_reset` is written.
- An expired or used token → 400 "Tautan sudah tidak berlaku. Silakan minta tautan baru."
- Password rule shared everywhere: `PASSWORD_MIN_LENGTH = 8` (`shared/utils/auth.ts`), used by zod schemas on both client and server.

Change password while signed in: `POST /api/app/me/change-password`, `POST /api/admin/me/change-password` (better-auth `changePassword` with `revokeOtherSessions: true`). A Google-only account (`hasPassword: false`) may *create* a password without the old one (`setPassword`).

## 7. Invitations

| | Workspace team invite | Staff invite |
|---|---|---|
| Table | `workspace_invitations` | `staff_invitations` |
| Created by | owner (`team.manage` + plan feature `teamAccess`) at `/app/team` | `staff.write` at `/admin/staff` |
| TTL | 7 days | 7 days |
| Token | `randomToken(32)`, only SHA-256 stored | same |
| Email template | `workspace_invitation` | `staff_invitation` |
| Accept page | `/app/auth/accept-invite?token=` | `/admin/auth/accept-invite?token=` |
| Re-invite same email | upsert on `(workspaceId, email)` → new token, old link dead | delete outstanding, create new |

Staff accounts are created **only** by accepting an invitation: `acceptStaffInvitation()` creates the `staff_users` row and its credential account through `staffAuth.api` internals (sign-up is disabled publicly), marks the invitation accepted and signs the person in. Workspace accept details are in `05-tenancy-and-onboarding.md` §4.

## 8. Rate limiting

On top of better-auth's built-in limiter, `server/core/rate-limit.ts` provides a fixed window stored in Postgres (`rate_limit_buckets`, `16` §4), because serverless instances share no memory. better-auth's own limiter is configured with `rateLimit: { storage: 'database' }` for the same reason (its rate-limit table is generated into each instance's schema):

```ts
assertRateLimit(scope, identifier, limit, windowMs)  // throws 429 RATE_LIMITED with retryAfterSeconds
resetRateLimit(key)
clientIp(headers)       // cf-connecting-ip → x-forwarded-for[0] → x-real-ip
LOGIN_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 }
```

Applied through a `hooks.before` middleware on each instance's sign-in path:
- `assertRateLimit('login:creator', email, 5, 15m)` **and** `assertRateLimit('login:creator:ip', ip, 20, 15m)`; on success `resetRateLimit('login:creator:' + email)`. The same for staff.
- Google start/callback: 20 / 15 min / IP. Sign-up: 10 / hour / IP. Forgot password: 5 / hour / email. Contact form: from setting `app.contactRateLimitPerHour`.

Every sign-in success writes audit `auth.sign_in`; a failure writes `auth.sign_in_failed`, with `workspaceId` resolved from the email when it matches an account, so the owner's activity log shows attempts on their account.

## 9. Session lifecycle and logout

- better-auth refreshes the session expiry on use (`updateAge`), so active creators stay signed in.
- `lastLoginAt` moves only on sign-in (`databaseHooks.session.create.after`). `lastSeenAt` moves through `touchLastSeen` (`16` §5).
- Logout calls `<basePath>/sign-out`, which deletes the session row and clears the cookie.
- Deactivating a user (owner deactivates a member, or staff deactivate a creator) calls `revokeAllSessions`.
- A 401 on any console call makes the client reset that audience's auth state and navigate to its login page (see `13-tenant-console.md`).

## 10. Impersonation — superadmin only

| Endpoint | Session created | Signs you in as |
|---|---|---|
| `POST /api/admin/workspaces/:id/impersonate` | creator session (`activeWorkspaceId`, `impersonatedBy`) | that workspace's active owner |
| `POST /api/admin/users/:id/impersonate` `{ workspaceId? }` | creator session | one specific creator login (oldest active membership if no workspaceId) |
| `POST /api/admin/staff/:id/impersonate` | **staff** session (`impersonatedBy`) | another staff member |

How a creator session is minted: `createImpersonationSession({ audience: 'creator', userId, workspaceId, impersonatedBy: staffId })` uses the creator instance's internal adapter (`(await creatorAuth.$context).internalAdapter.createSession(...)`) with a short expiry (1 hour) and returns the `Set-Cookie` header. **Verify this internal API against the installed better-auth version when building**; if it has changed, keep the facade signature and adapt only `creator.ts`.

Rules:
- All doors start with `requireImpersonator()` (superadmin **and not already impersonating**, so no chains) and write a start row and a stop row to `audit_logs` (`workspace.impersonate_start/stop`, `staff.impersonate_start/stop`).
- Impersonated creator sessions are **read-only for billing**: `requireNotImpersonating(ctx)` guards checkout, cancelling a payment and cancelling the subscription. They also cannot connect or disconnect social accounts, or change the password or email. The console shows a permanent `<ImpersonationBanner>` with a [Berhenti] button.
- Staff impersonation refuses targets that are **another superadmin** (lateral move, unreadable audit trail) or **yourself**.
- The impersonation cookie is set on the creator cookie name, so the operator's staff session (different cookie) survives untouched. For staff-to-staff impersonation, the original staff session id is kept in a separate HttpOnly cookie `socialz_staff_return` and restored on stop.
- Stop: `POST /api/app/impersonation/stop` (creator) or `POST /api/admin/impersonation/stop` (staff) → 400 if the session is not impersonated; audit `*.impersonate_stop`; revoke the session.
- Impersonated sessions are never counted in usage analytics (`16` §6).

## 11. "Who am I" endpoints

- `GET /api/admin/me` → `{ user: AuthUser(staff), displayTimezone, impersonating }`
- `GET /api/admin/menus` → DB-driven sidebar pruned to permissions (`04` §1.3)
- `GET /api/app/me` →

  ```json
  {
    "user": { "id", "name", "email", "phone", "image", "audience": "creator", "emailVerified": true,
              "workspaceRole": "owner", "abilities": ["billing.manage", "..."], "hasPassword": true },
    "workspace": { "id", "name", "slug", "status", "timezone",
                   "onboardingCompletedAt": null, "needsAccountSelection": false },
    "onboarding": { "accountConnected": true, "bioCreated": false, "linkAdded": false, "postScheduled": false, "dismissed": false },
    "displayTimezone": "Asia/Jakarta",
    "impersonating": false
  }
  ```

## 12. Security checklist

- Password hashing by better-auth (scrypt); hashes never leave the server, only `hasPassword`.
- Reset and verification tokens in `verifications`; invitation tokens: **only SHA-256 stored**, the raw value exists only in the emailed link.
- `BETTER_AUTH_SECRET` and `SETTINGS_SECRET` required in production.
- Cookies HttpOnly, Secure (prod), SameSite=Lax. Mutating `/api/app/**` and `/api/admin/**` requests also pass the `origin-check` middleware (Origin or `Sec-Fetch-Site` must match `SITE_URL`). better-auth's own `trustedOrigins` is set to `[SITE_URL]`.
- Sign-in rate-limited per email and per IP.
- Audit rows for: sign-in (+failed), register, password reset, suspend/reinstate, plan change, impersonation start/stop, role/permission edits, workspace deletion, payment cancel, webhook replay, team changes, social account connect/disconnect.
