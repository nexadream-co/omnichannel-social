# 05 — Tenancy, Sign-up, Onboarding & Team

## 1. The workspace model

```
workspace  (= the creator's billing account)
 ├── subscription → plan           (exactly one row per workspace, created at signup)
 ├── subscription_events[]         (append-only history)
 ├── payments[]
 ├── workspace_members → users     (owner | editor | viewer)
 ├── workspace_invitations[]
 ├── trial_claims?
 └── domain rows (every one carries workspaceId):
       social_accounts, posts, post_targets, media_assets, links, short_links,
       link_clicks, bio_pages, bio_items, dm_rules, dm_events …   (../ARCHITECTURE.md §7)
```

Rules (MUST):

1. **Every workspace-owned row carries `workspaceId`**. It is the only defence against cross-workspace leakage.
2. **Every workspace-scoped query goes through a `WorkspaceContext`** (from `requireWorkspaceContext()` in a handler, or `systemContext()` in a job handler) and includes `workspaceId` in `where`. Review rule: *a Drizzle query in `server/core/**` on a workspace table without `workspaceId` in its `where` is a bug.* An integration test asserts it (see `../ARCHITECTURE.md` §15).
3. One login belongs to **one workspace** today (workspace switching is not built). The schema already allows many (`workspace_members` is a join table; sessions carry `activeWorkspaceId`). An address with a membership in another non-deleted workspace (**even an inactive one**) cannot be invited or accept an invitation (409). The inviter is told only *that* it belongs elsewhere, never *where*; the invitee (who owns the address) is told the name.
4. Data is **never deleted** to tidy up: social accounts over the plan cap become `disabled`; auto-reply rules are paused; members are deactivated; workspaces are soft-deleted.
5. Timestamps are stored in UTC. `workspaces.timezone` (WIB / WITA / WIT) is the clock for scheduling defaults, calendar days and analytics day boundaries.

There are no branches or locations in Socialz.id. The generic blueprint's branch logic is replaced by **social-account limit enforcement** (§5).

---

## 2. Sign-up — `registerCreator()` (`server/core/registration.ts`)

Used by `POST /api/app/register`. The Google path uses the shared part, `provisionWorkspace()`, from a better-auth `user.create.after` hook (`03` §5). Sign-up asks **only for the person**; everything else is optional and comes later.

Schema (messages in Bahasa):

```ts
export const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.'),
  email: z.email('Format email tidak valid.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, 'Kata sandi minimal 8 karakter.'),
  phone: z.string().refine(isValidIndonesianPhone, 'Nomor HP tidak valid.').optional(),
  timezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']).default('Asia/Jakarta'),  // auto-detected by the browser
  acceptTerms: z.literal(true, { error: 'Anda perlu menyetujui syarat & ketentuan.' })
})
```

Algorithm:

1. Setting `app.registrationOpen` false → 503 "Pendaftaran sedang ditutup sementara."
2. Normalize email (trim, lowercase) and phone (`62…`).
3. Email taken → 409 `CONFLICT` `{ field: 'email' }` "Email sudah terdaftar. Silakan masuk."; phone taken → 409 `{ field: 'phone' }`.
4. Create the user through `creatorAuth.api.signUpEmail` (this hashes the password and creates the `credential` account; it sends the verification email, `03` §4).
5. `provisionWorkspace(userId, { name, email, timezone, phone })`:
   - **Trial guard**: if setting `billing.oneTrialPerEmail` is true, look up `trial_claims` by normalized email.
   - Read settings `billing.trialPlanSlug` (default `kreator`) and `billing.defaultPlanSlug` (default `gratis`). Free plan missing → 500.
   - `grantTrial = trialPlanExists && !priorClaim`. Plan = trial plan or free. `trialEndsAt = now + plan.trialDays`.
   - **One transaction**:
     - create `workspaces` (name = creator name, unique slug, timezone, `dataConsentAcceptedAt = now`);
     - create `workspace_members` with role `owner`;
     - create `subscriptions` (`trialing` + `trialEndsAt`, or `downgraded` on `gratis`);
     - create `subscription_events` `{ transition: 'signup', toStatus, toPlanSlug, period: 'monthly' }`;
     - create `trial_claims` if a trial was granted and the guard is on;
     - set `sessions.activeWorkspaceId` for the new session.
   - If the transaction fails after the user was created, delete that user (compensation) and return 500, so no user exists without a workspace. `provisionWorkspace` is idempotent: a user who already owns a workspace gets it back.
6. `invalidateEntitlements(workspaceId)`.
7. In-app notifications `welcome` and (if trial) `trial_started`, **email channel off** for these. The welcome **email** is sent separately with richer variables (`name`, `loginUrl`, a link to a 30-second getting-started video).
8. `notifyStaff('workspaces.read', { templateKey: 'admin_new_workspace' })`: a bell row for staff, no email.
9. Return with the session cookie set → the creator lands on `/app`; audit `workspace.register`.

Slug: `slugify(name) || 'kreator'`, then append `-2`, `-3`… until unique. `uniqueWorkspaceSlug(name, excludeWorkspaceId)` lets a workspace keep its own slug when renamed. The workspace slug is internal; the public Etalase handle is separate (`bio_pages.handle`).

Why the trial is keyed on **email**: an email exists on every signup path including Google, so the check runs once at signup and is never revisited. Since signup already refuses duplicate emails, the claim only matters after an account is deleted and its address freed. This is an accepted trade-off.

---

## 3. Onboarding — a checklist, not a gate (`server/core/onboarding.ts`)

The generic blueprint blocks the console until onboarding is done. **Socialz.id does not.** Following the simplicity principle, a new creator can use any screen right away, and the Home page shows a checklist that guides them to the first value.

The checklist has 4 steps, each computed from real data (never from a stored flag that can drift):

| Step | Label (Bahasa) | Done when |
|---|---|---|
| `accountConnected` | Hubungkan akun | at least one `social_accounts` row with status `active` |
| `bioCreated` | Buat Etalase | a `bio_pages` row exists and is published |
| `linkAdded` | Tambah produk pertama | at least one `links` row |
| `postScheduled` | Jadwalkan postingan pertama | at least one `post_targets` row in `scheduled` or `published` |

Endpoints:
- `GET /api/app/onboarding` → `{ steps: {…}, dismissed: boolean, completedAt }` (also embedded in `/api/app/me`).
- `POST /api/app/onboarding/dismiss` (`settings.manage`) → sets `workspaces.onboardingCompletedAt = now` even when steps remain ("Sembunyikan panduan").
- `PATCH /api/app/onboarding/profile` (`settings.manage`) → optional creator profile: `{ niche?, affiliatePrograms?: ('shopee'|'tiktok_shop'|'tokopedia'|'lazada'|'other')[], timezone? }`. These tailor templates and tips; none are required.

When the fourth step completes, the server sets `onboardingCompletedAt = now` (inside the write that completed it, idempotent) and the UI shows a small celebration once. Each step's card links straight to the screen that completes it, with a one-sentence explanation of why it matters.

The checklist is also where **email verification** is nudged: the "Hubungkan akun" step shows "Verifikasi email dulu" with a resend button until `emailVerified` is true (`03` §4).

---

## 4. Team — members who share a workspace (`server/core/team.ts`)

The team feature is for creators who work with an assistant or a small agency. It is gated by the plan feature `teamAccess` (`06`) and the `teamMembers` limit. On plans without it, the "Tim" nav entry shows a lock and opens the upgrade dialog.

| Function | Ability | Notes |
|---|---|---|
| `listTeam(ctx)` | `team.manage` | members + pending invitations + seat usage |
| `inviteMember(ctx, { email, name?, role })` | `team.manage` + feature `teamAccess` | see below |
| `revokeInvitation(ctx, id)` | `team.manage` | sets `revokedAt`, audit `team.invite_revoke` |
| `updateMember(ctx, memberId, { role?, isActive? })` | `team.manage` | see below |
| `previewInvitation(token)` | public | what the accept page shows before asking for a password |
| `acceptInvitation(input)` | public | see below |
| `teamSeatSummary(ctx)` | any member | used / pending / limit |

**Invite**:
1. Role check, then plan check: `assertAbility(ctx, 'team.manage')`, `requireEntitlement(ctx, 'teamAccess')`.
2. Seat check: `assertWithinLimit(workspaceId, 'teamMembers', activeMembers + pendingUnexpiredInvites)` (the owner counts as a seat).
3. Address already a member here → 409. Member of another workspace → 409 (without the name).
4. `token = randomToken(32)`; upsert `workspace_invitations` on `(workspaceId, email)` with `sha256(token)`, 7-day expiry, clearing `acceptedAt` / `revokedAt`.
5. Email `workspace_invitation` with `inviteUrl = {{SITE_URL}}/app/auth/accept-invite?token=…`, inviter name, workspace name, role label and its one-sentence summary, expiry formatted in the workspace timezone.
6. Audit `team.invite`.

**Accept**:
1. Find by token hash; used / revoked / expired → 400 "Undangan sudah tidak berlaku."
2. Seat check again (`activeMembers`).
3. Existing account with that email in another workspace → 409 (with the name).
4. Ask for a password **only** when the account has no way to sign in (a new account, or an existing one with neither a password nor a Google link). An invitation must never overwrite someone's credentials.
5. Transaction: create or update the user (`emailVerified = true` for a new account, because the emailed link proves the address); upsert the membership `(workspaceId, userId)` with the invited role, `isActive: true`; mark the invitation accepted.
6. Audit `team.invite_accept`; `invalidateEntitlements`; notify the owner with `team_invite_accepted` (bell only, failures swallowed).
7. The client receives a session cookie and lands on `/app`.

**Update member**:
- The owner's membership → 409 (ownership is not editable here).
- Your own membership → 409.
- Reactivating → refuse if the person is active elsewhere; `assertWithinLimit('teamMembers', activeMembers)`.
- A role change and (de)activation each write their own audit row (`team.role_change`, `team.reactivate` / `team.deactivate`). Deactivation also calls `revokeAllSessions` for that user.
- Members are **deactivated, never deleted** (posts and audit rows point at them).

---

## 5. Social-account limit enforcement (replaces branches)

This is the Socialz.id version of the generic blueprint's "deactivate excess branches and let the owner choose" flow. It runs after a downgrade (trial expiry, grace expiry, the end of a cancelled period, or an admin plan override).

`enforceWorkspaceLimits(workspaceId)` (`server/core/subscriptions.ts`), **in one transaction**:

1. Read the current plan's `socialAccounts`, `autoReplyRules` and `bioPages` limits (`-1` = unlimited → skip that resource).
2. **Social accounts:** active accounts ordered by `createdAt asc`; keep the first `max`, set the rest to `status = 'disabled'` (tokens are kept; reconnecting is not needed on upgrade).
3. **Scheduled posts:** every `post_targets` row in `scheduled` / `quota_deferred` on a now-disabled account goes back to `draft`, and its queued job row is cancelled in the same transaction.
4. **Auto-reply rules:** active rules ordered by `createdAt desc`; pause the newest ones beyond `max` (`active = false`, `pausedReason = 'plan_limit'`).
5. **Etalase pages:** published pages beyond `max`, keeping the first created, become unpublished. Their short-domain handle shows a friendly "Etalase sedang tidak aktif" page instead of a 404.
6. Set `workspaces.downgradeResolvedAt = null` **in the same transaction**, because the flag that triggers the "choose" dialog must land with the deactivation it asks about.

After commit: `invalidateEntitlements(workspaceId)` and notify the owner with `subscription_downgraded` (email + bell), linking to `/app/accounts`.

`needsAccountSelection(workspaceId)` = `downgradeResolvedAt` is null **and** the workspace has more connected social accounts (active + disabled-by-plan) than the limit. It is exposed on the profile and subscription endpoints. The console then shows a **blocking dialog** on the accounts page: "Pilih akun yang tetap aktif", which says plainly "Data Anda tidak dihapus. Akun lain aktif kembali saat Anda upgrade."

`selectActiveAccounts(ctx, { socialAccountIds })` (`accounts.manage`):
- count ≤ limit, else 402;
- every id belongs to the workspace, else 404;
- one transaction: activate the chosen ones, disable the others (and return their scheduled targets to draft), set `downgradeResolvedAt = now`.

On upgrade (`pay`), nothing is reactivated automatically except clearing the selection need. Disabled accounts show a one-click [Aktifkan lagi] button, which runs `assertWithinLimit('socialAccounts', activeCount)`. Paused rules show [Lanjutkan] the same way.

---

## 6. Workspace settings (owner)

`updateWorkspaceSettings(ctx, body)` (`settings.manage`), used by `PATCH /api/app/settings`: workspace name, timezone, default posting times, notification preferences, plus the optional creator profile. **Paid settings call `requireEntitlement` only when the paid option is being chosen.** Turning one off, or saving other fields, never requires the plan. For example, a downgraded owner can still rename their workspace even though `removeBranding` is no longer included.

---

## 7. Workspace lifecycle (platform side)

| Action | Endpoint | Gate | Effect |
|---|---|---|---|
| Suspend | `POST /api/admin/workspaces/:id/suspend { reason }` | `workspaces.write` | `status=suspended`, `suspendedAt`, `suspendedReason`; `transitionSubscription('suspend', force)`; **pause all publishing and auto-reply for the workspace** (pending jobs exit when they see the status); notify owner `workspace_suspended`; audit `workspace.suspend`. Every console request → 403 `WORKSPACE_SUSPENDED`. Short links keep redirecting unless staff also disable them under link moderation. |
| Reinstate | `POST /api/admin/workspaces/:id/reinstate` | `workspaces.write` | `status=active`, clear suspension; `transitionSubscription('reinstate', force)` → `active` if a paid period remains, else `downgraded`; scheduled targets whose time passed during the suspension go to `failed` with reason "Terlewat saat akun ditangguhkan" (never published late without the creator's consent); audit. |
| Change plan (override) | `POST /api/admin/workspaces/:id/plan { planSlug, period, status, currentPeriodEnd?, note? }` | `subscriptions.write` | Bypasses the transition guard on purpose (comped / negotiated). One transaction: update the subscription + `subscription_events { transition: 'admin_override' }`. Then `invalidateEntitlements`, `enforceWorkspaceLimits`, audit `subscription.plan_change`. |
| Soft delete | `DELETE /api/admin/workspaces/:id` | **superadmin** | `deletedAt=now`, `status=deleted`; revoke all social account tokens at the platforms (best effort) and cancel all jobs; email/notify owner `workspace_deleted` (it's their last message); audit `workspace.delete`. Hard purge is a separate job after retention. |
| Impersonate owner | `POST /api/admin/workspaces/:id/impersonate` | superadmin, not impersonating | see `03-auth-and-sessions.md` §10 |

---

## 8. Owner data rights (UU PDP)

- **Export**: `GET /api/app/account/export` (`account.manage`) returns JSON of everything the workspace owns: workspace, subscription, payments, members, notifications (last 500), social accounts (**without tokens**), posts and targets, media metadata, links, short links, click rollups (no IP hashes), Etalase pages and items, auto-reply rules and events (commenter usernames included, because they are the creator's own audience data). Sent with `Content-Disposition: attachment; filename="socialz-data-<slug>.json"`.
- **Deletion request**: `POST /api/app/account/delete-request { reason?, confirmation: true }` (`account.manage`). This is a *request*, not an immediate purge. It sets `deleteRequestedAt` (a second request → 409), writes audit `workspace.delete_request`, notifies staff with `workspaces.write` (warning level, link to `/admin/workspaces/:id`), and returns `{ slaDays }` from `privacy.deleteRequestSlaDays`.
- **Disconnecting a social account** (`accounts.manage`) revokes its token at the platform where the API allows it, deletes the stored token ciphertext, keeps historical posts, and writes audit `social_account.disconnect`.
- **Meta data deletion callback** (a person deletes Socialz.id from their Instagram or Facebook settings) is handled as described in `../ARCHITECTURE.md` §9.4, and its status page is `/legal/data-deletion?code=…`.
- The public page `/hapus-akun` reads its promises (contact, SLA days, backup retention, financial-record retention) from settings, so the page and the app can never disagree.
- Consent is captured at signup (`dataConsentAcceptedAt`).
- The `privacy.retentionMonths` setting documents how long personal data is kept.
