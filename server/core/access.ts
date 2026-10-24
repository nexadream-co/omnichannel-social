import { needsAccountSelection } from './subscriptions'
import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { abilitiesFor, type WorkspaceRoleSlug } from '../../shared/utils/workspace-abilities'
import type { Executor } from './db/client'
import {
  bioPages, dmRules, links, menus, permissions, plans, postTargets, rolePermissions, roles, socialAccounts,
  staffUsers, subscriptions, users, workspaceMembers, workspaces
} from './db/schema'
import { appError } from './errors'
import { hasPassword, type SessionInfo } from './services/auth'

const unauthenticated = () => appError(401, 'Sesi kamu sudah berakhir. Silakan masuk lagi.', 'UNAUTHENTICATED')

export interface CreatorAccess {
  user: typeof users.$inferSelect
  membership: typeof workspaceMembers.$inferSelect
  workspace: typeof workspaces.$inferSelect
  subscription: typeof subscriptions.$inferSelect
  plan: typeof plans.$inferSelect
  sessionNeedsWorkspace: boolean
}

async function noActiveMembershipMessage(db: Executor, userId: string): Promise<string> {
  const [inactive] = await db.select({ name: workspaces.name }).from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.isActive, false)))
    .limit(1)
  return inactive
    ? `Akses kamu ke ${inactive.name} sudah dinonaktifkan oleh pemiliknya. Silakan hubungi mereka.`
    : 'Akun kamu belum tergabung di ruang kerja mana pun.'
}

/** Steps 2–5 of requireWorkspaceContext (docs/blueprint/03 §3). */
export async function resolveCreatorAccess(db: Executor, session: SessionInfo): Promise<CreatorAccess> {
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
  if (!user?.isActive) throw unauthenticated()

  const memberships = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true)))
    .orderBy(asc(workspaceMembers.createdAt))
  const membership = memberships.find(m => m.workspaceId === session.activeWorkspaceId) ?? memberships[0]
  if (!membership) throw appError(403, await noActiveMembershipMessage(db, user.id), 'FORBIDDEN')

  const [row] = await db.select({ workspace: workspaces, subscription: subscriptions, plan: plans }).from(workspaces)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(workspaces.id, membership.workspaceId)).limit(1)
  if (!row) throw appError(403, 'Ruang kerja tidak ditemukan.', 'FORBIDDEN')
  if (row.workspace.deletedAt) throw appError(403, 'Akun ini sudah dihapus.', 'WORKSPACE_DELETED')
  if (row.workspace.status === 'suspended') {
    throw appError(403, 'Akun kamu sedang ditangguhkan. Hubungi tim Socialz.id untuk informasi lebih lanjut.', 'WORKSPACE_SUSPENDED')
  }
  return { user, membership, ...row, sessionNeedsWorkspace: session.activeWorkspaceId !== membership.workspaceId }
}

export interface StaffAccess {
  user: typeof staffUsers.$inferSelect
  role: typeof roles.$inferSelect
  permissions: Set<string>
}

export async function resolveStaffAccess(db: Executor, session: SessionInfo): Promise<StaffAccess> {
  const [row] = await db.select({ user: staffUsers, role: roles }).from(staffUsers)
    .innerJoin(roles, eq(roles.id, staffUsers.roleId))
    .where(eq(staffUsers.id, session.userId)).limit(1)
  if (!row?.user.isActive) throw unauthenticated()
  const keys = await db.select({ key: permissions.key }).from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, row.role.id))
  return { user: row.user, role: row.role, permissions: new Set(keys.map(k => k.key)) }
}

/** Written at most once per 15 minutes per user, by a conditional UPDATE (docs/blueprint/16 §5). Never throws. */
export async function touchLastSeen(db: Executor, audience: 'creator' | 'staff', userId: string): Promise<void> {
  const table = audience === 'creator' ? users : staffUsers
  try {
    await db.update(table).set({ lastSeenAt: sql`now()` })
      .where(and(eq(table.id, userId), or(isNull(table.lastSeenAt), sql`${table.lastSeenAt} < now() - interval '15 minutes'`)))
  } catch {
    // best effort
  }
}

/** The onboarding flags (linkAdded is kept for older clients), computed from real data (docs/blueprint/05 §3). */
export async function onboardingSteps(db: Executor, workspaceId: string) {
  const [[accounts], [bios], [productLinks], [scheduled], [autoReplies], livePlatforms] = await Promise.all([
    db.select({ n: count() }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.status, 'active'))),
    db.select({ n: count() }).from(bioPages).where(and(eq(bioPages.workspaceId, workspaceId), eq(bioPages.published, true))),
    db.select({ n: count() }).from(links).where(eq(links.workspaceId, workspaceId)),
    db.select({ n: count() }).from(postTargets).where(and(eq(postTargets.workspaceId, workspaceId), inArray(postTargets.status, ['scheduled', 'published']))),
    db.select({ n: count() }).from(dmRules).where(and(eq(dmRules.workspaceId, workspaceId), eq(dmRules.active, true))),
    db.selectDistinct({ platform: socialAccounts.platform }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), inArray(socialAccounts.status, ['active', 'needs_reauth'])))
  ])
  // Balas Otomatis is Instagram-only: a creator with only Threads / Facebook accounts has nothing to add, so the step counts as done.
  const noInstagram = livePlatforms.length > 0 && !livePlatforms.some(p => p.platform === 'instagram')
  return {
    accountConnected: (accounts?.n ?? 0) > 0,
    bioCreated: (bios?.n ?? 0) > 0,
    linkAdded: (productLinks?.n ?? 0) > 0,
    postScheduled: (scheduled?.n ?? 0) > 0,
    autoReplyAdded: (autoReplies?.n ?? 0) > 0 || noInstagram
  }
}

/** GET /api/app/me (docs/blueprint/03 §11). */
export async function creatorProfile(db: Executor, access: CreatorAccess, session: SessionInfo) {
  const role = access.membership.role as WorkspaceRoleSlug
  const steps = await onboardingSteps(db, access.workspace.id)
  return {
    user: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
      phone: access.user.phone,
      image: access.user.image,
      locale: access.user.locale,
      audience: 'creator' as const,
      emailVerified: access.user.emailVerified,
      workspaceRole: role,
      abilities: abilitiesFor(role),
      hasPassword: await hasPassword(access.user.id)
    },
    workspace: {
      id: access.workspace.id,
      name: access.workspace.name,
      slug: access.workspace.slug,
      status: access.workspace.status,
      timezone: access.workspace.timezone,
      onboardingCompletedAt: access.workspace.onboardingCompletedAt,
      needsAccountSelection: await needsAccountSelection(db, access.workspace.id)
    },
    subscription: {
      status: access.subscription.status,
      planSlug: access.plan.slug,
      planName: access.plan.name,
      trialEndsAt: access.subscription.trialEndsAt,
      currentPeriodEnd: access.subscription.currentPeriodEnd
    },
    onboarding: { ...steps, dismissed: Boolean(access.workspace.onboardingCompletedAt) },
    milestones: access.workspace.milestones ?? {},
    displayTimezone: access.workspace.timezone,
    impersonating: Boolean(session.impersonatedBy)
  }
}

export function staffProfile(access: StaffAccess, session: SessionInfo, displayTimezone: string) {
  return {
    user: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
      phone: access.user.phone,
      image: access.user.image,
      audience: 'staff' as const,
      emailVerified: access.user.emailVerified,
      role: { id: access.role.id, slug: access.role.slug, name: access.role.name, isSuperAdmin: access.role.isSuperAdmin },
      permissions: [...access.permissions]
    },
    displayTimezone,
    impersonating: Boolean(session.impersonatedBy)
  }
}

export interface MenuTreeNode {
  id: string
  label: string
  slug: string
  path: string | null
  icon: string | null
  children: MenuTreeNode[]
}

/** DB-driven sidebar pruned to the caller (docs/blueprint/04 §1.3). */
export async function staffMenuTree(db: Executor, access: StaffAccess): Promise<MenuTreeNode[]> {
  const rows = await db.select().from(menus).where(eq(menus.isActive, true)).orderBy(asc(menus.order))
  const allowed = (key: string | null) => !key || access.role.isSuperAdmin || access.permissions.has(key)
  const build = (parentId: string | null): MenuTreeNode[] => rows
    .filter(row => row.parentId === parentId && allowed(row.permissionKey))
    .map(row => ({ id: row.id, label: row.label, slug: row.slug, path: row.path, icon: row.icon, children: build(row.id) }))
    .filter(node => node.path !== null || node.children.length > 0)
  return build(null)
}
