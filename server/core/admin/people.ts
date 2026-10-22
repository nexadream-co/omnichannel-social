import { createHash } from 'node:crypto'
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { PERMISSION_KEYS, type PermissionKey } from '../../../shared/utils/permissions'
import { recordAudit } from '../audit'
import { assertPermission, type CoreContext, type StaffContext } from '../context'
import { randomToken } from '../crypto'
import { menus, permissions, rolePermissions, roles, staffAccounts, staffInvitations, staffUsers, users } from '../db/schema'
import { sendTemplatedEmail } from '../email'
import { env } from '../env'
import { appError } from '../errors'
import { createStaffImpersonationSession, hashPassword, revokeAllSessions } from '../services/auth'

const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default('')
})
const audit = (ctx: StaffContext, action: string, extra: { targetType?: string, targetId?: string, workspaceId?: string | null, metadata?: Record<string, unknown> }) =>
  recordAudit(ctx, { audience: 'staff', action, actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, ...extra })

// ---------------------------------------------------------------- creator logins (/admin/users)

export const usersQuery = listQuery

export async function listCreatorUsers(ctx: StaffContext, query: z.infer<typeof usersQuery>) {
  assertPermission(ctx, 'workspaces.read')
  const like = `%${query.search}%`
  const where = query.search ? or(ilike(users.name, like), ilike(users.email, like), ilike(users.phone, like)) : undefined
  const [rows, [total]] = await Promise.all([
    ctx.db.select({
      id: users.id, name: users.name, email: users.email, phone: users.phone, emailVerified: users.emailVerified, isActive: users.isActive,
      lastLoginAt: users.lastLoginAt, lastSeenAt: users.lastSeenAt, createdAt: users.createdAt,
      methods: sql<string[]>`coalesce((select array_agg(distinct case when a.password is not null then 'password' else a.provider_id end) from accounts a where a.user_id = ${sql.raw('"users"."id"')}), '{}')`,
      memberships: sql<{ workspaceId: string, workspaceName: string, role: string }[]>`coalesce((select json_agg(json_build_object('workspaceId', w.id, 'workspaceName', w.name, 'role', m.role)) from workspace_members m join workspaces w on w.id = m.workspace_id where m.user_id = ${sql.raw('"users"."id"')} and m.is_active and w.deleted_at is null), '[]')`
    }).from(users).where(where).orderBy(desc(users.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(users).where(where)
  ])
  return { items: rows, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

/** Support for a compromised account: signs the creator out everywhere. Superadmin only. */
export async function revokeCreatorSessions(ctx: StaffContext, userId: string) {
  if (!ctx.isSuperAdmin) throw appError(403, 'Hanya superadmin yang bisa melakukan ini.', 'FORBIDDEN')
  const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw appError(404, 'Pengguna tidak ditemukan.', 'NOT_FOUND')
  await revokeAllSessions(userId, 'creator')
  await audit(ctx, 'user.revoke_sessions', { targetType: 'user', targetId: userId })
}

// ---------------------------------------------------------------- staff (/admin/staff)

export async function listStaff(ctx: StaffContext, query: z.infer<typeof listQuery>) {
  assertPermission(ctx, 'staff.read')
  const like = `%${query.search}%`
  const where = query.search ? or(ilike(staffUsers.name, like), ilike(staffUsers.email, like)) : undefined
  const [items, [total], roleRows, invites] = await Promise.all([
    ctx.db.select({ id: staffUsers.id, name: staffUsers.name, email: staffUsers.email, phone: staffUsers.phone, isActive: staffUsers.isActive, roleId: staffUsers.roleId, roleName: roles.name, isSuperAdmin: roles.isSuperAdmin, lastLoginAt: staffUsers.lastLoginAt, createdAt: staffUsers.createdAt })
      .from(staffUsers).innerJoin(roles, eq(roles.id, staffUsers.roleId)).where(where).orderBy(asc(staffUsers.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(staffUsers).where(where),
    ctx.db.select({ id: roles.id, name: roles.name, isSuperAdmin: roles.isSuperAdmin }).from(roles).orderBy(asc(roles.createdAt)),
    ctx.db.select({ id: staffInvitations.id, email: staffInvitations.email, name: staffInvitations.name, roleName: roles.name, expiresAt: staffInvitations.expiresAt, createdAt: staffInvitations.createdAt })
      .from(staffInvitations).innerJoin(roles, eq(roles.id, staffInvitations.roleId)).where(and(isNull(staffInvitations.acceptedAt), gt(staffInvitations.expiresAt, new Date()))).orderBy(desc(staffInvitations.createdAt))
  ])
  return { items, roles: roleRows, invitations: invites, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

async function roleOrThrow(ctx: StaffContext, roleId: string) {
  const [role] = await ctx.db.select().from(roles).where(eq(roles.id, roleId)).limit(1)
  if (!role) throw appError(404, 'Peran tidak ditemukan.', 'NOT_FOUND', { field: 'roleId' })
  if (role.isSuperAdmin && !ctx.isSuperAdmin) throw appError(403, 'Hanya superadmin yang bisa memberi peran superadmin.', 'FORBIDDEN')
  return role
}

export const staffInviteSchema = z.object({ email: z.email('Format email tidak valid.'), name: z.string().trim().max(100).optional(), roleId: z.string().min(1, 'Pilih peran.') })
const INVITE_TTL_MS = 7 * 86_400_000

export async function inviteStaff(ctx: StaffContext, input: z.infer<typeof staffInviteSchema>) {
  assertPermission(ctx, 'staff.write')
  const role = await roleOrThrow(ctx, input.roleId)
  const email = input.email.trim().toLowerCase()
  const [existing] = await ctx.db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, email)).limit(1)
  if (existing) throw appError(409, 'Email ini sudah terdaftar sebagai staf.', 'CONFLICT', { field: 'email' })
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await ctx.db.delete(staffInvitations).where(and(eq(staffInvitations.email, email), isNull(staffInvitations.acceptedAt)))
  await ctx.db.insert(staffInvitations).values({ email, name: input.name || null, roleId: role.id, tokenHash: sha256(token), invitedById: ctx.staffUserId, expiresAt })
  ctx.defer(sendTemplatedEmail(ctx, 'staff_invitation', email, {
    name: input.name || email, inviterName: ctx.staffName, roleName: role.name,
    inviteUrl: `${env().siteUrl}/admin/auth/accept-invite?token=${token}`,
    expiresAt: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(expiresAt)
  }))
  await audit(ctx, 'staff.invite', { targetType: 'staff_invitation', metadata: { email, role: role.slug } })
}

export async function revokeStaffInvitation(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'staff.write')
  await ctx.db.delete(staffInvitations).where(and(eq(staffInvitations.id, id), isNull(staffInvitations.acceptedAt)))
}

async function findStaffInvitation(ctx: Pick<CoreContext, 'db'>, token: string) {
  const [row] = await ctx.db.select({ invitation: staffInvitations, roleName: roles.name }).from(staffInvitations).innerJoin(roles, eq(roles.id, staffInvitations.roleId))
    .where(eq(staffInvitations.tokenHash, sha256(token))).limit(1)
  if (!row || row.invitation.acceptedAt || row.invitation.expiresAt <= new Date()) throw appError(410, 'Undangan ini sudah tidak berlaku. Minta undangan baru ke admin.', 'NOT_FOUND')
  return row
}

export async function previewStaffInvitation(ctx: Pick<CoreContext, 'db'>, token: string) {
  const { invitation, roleName } = await findStaffInvitation(ctx, token)
  return { email: invitation.email, name: invitation.name, roleName, expiresAt: invitation.expiresAt }
}

export const acceptStaffSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(128)
})

/** The invitee sets name + password; then signs in normally. One transaction. */
export async function acceptStaffInvitation(ctx: CoreContext, input: z.infer<typeof acceptStaffSchema>) {
  const { invitation } = await findStaffInvitation(ctx, input.token)
  const password = await hashPassword(input.password)
  await ctx.db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, invitation.email)).limit(1)
    if (taken) throw appError(409, 'Email ini sudah terdaftar sebagai staf.', 'CONFLICT')
    const [user] = await tx.insert(staffUsers).values({ name: input.name, email: invitation.email, emailVerified: true, roleId: invitation.roleId }).returning({ id: staffUsers.id })
    await tx.insert(staffAccounts).values({ userId: user!.id, providerId: 'credential', accountId: user!.id, password })
    await tx.update(staffInvitations).set({ acceptedAt: new Date() }).where(eq(staffInvitations.id, invitation.id))
  })
  await recordAudit(ctx, { audience: 'staff', action: 'staff.accept_invite', actorName: input.name, metadata: { email: invitation.email } })
  return { email: invitation.email }
}

export const staffUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  roleId: z.string().optional(),
  isActive: z.boolean().optional()
})

export async function updateStaff(ctx: StaffContext, id: string, input: z.infer<typeof staffUpdateSchema>) {
  assertPermission(ctx, 'staff.write')
  const [target] = await ctx.db.select({ user: staffUsers, isSuperAdmin: roles.isSuperAdmin }).from(staffUsers).innerJoin(roles, eq(roles.id, staffUsers.roleId)).where(eq(staffUsers.id, id)).limit(1)
  if (!target) throw appError(404, 'Staf tidak ditemukan.', 'NOT_FOUND')
  const self = id === ctx.staffUserId
  if (self && input.isActive === false) throw appError(409, 'Kamu tidak bisa menonaktifkan diri sendiri.', 'CONFLICT')
  if (self && input.roleId && input.roleId !== target.user.roleId) throw appError(409, 'Kamu tidak bisa mengubah peranmu sendiri.', 'CONFLICT')
  if (target.isSuperAdmin && !ctx.isSuperAdmin) throw appError(403, 'Hanya superadmin yang bisa mengubah superadmin.', 'FORBIDDEN')
  if (input.roleId) await roleOrThrow(ctx, input.roleId)
  await ctx.db.update(staffUsers).set({ ...input, updatedAt: new Date() }).where(eq(staffUsers.id, id))
  if (input.isActive === false) await revokeAllSessions(id, 'staff')
  if (input.roleId && input.roleId !== target.user.roleId) await audit(ctx, 'role.update', { targetType: 'staff_user', targetId: id, metadata: { from: target.user.roleId, to: input.roleId } })
  if (input.isActive !== undefined && input.isActive !== target.user.isActive) await audit(ctx, input.isActive ? 'staff.activate' : 'staff.deactivate', { targetType: 'staff_user', targetId: id })
}

// ---------------------------------------------------------------- roles + permissions

export async function listRoles(ctx: StaffContext) {
  assertPermission(ctx, 'roles.read')
  const [rows, grants, staffCounts] = await Promise.all([
    ctx.db.select().from(roles).orderBy(asc(roles.createdAt)),
    ctx.db.select({ roleId: rolePermissions.roleId, key: permissions.key }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)),
    ctx.db.select({ roleId: staffUsers.roleId, n: count() }).from(staffUsers).groupBy(staffUsers.roleId)
  ])
  return {
    items: rows.map(role => ({
      ...role,
      permissions: role.isSuperAdmin ? PERMISSION_KEYS : grants.filter(g => g.roleId === role.id).map(g => g.key),
      staffCount: staffCounts.find(c => c.roleId === role.id)?.n ?? 0
    }))
  }
}

const roleBase = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'Slug: huruf kecil, angka dan tanda hubung.'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).nullable().optional(),
  permissions: z.array(z.string()).max(200)
})
export const roleSchema = roleBase.extend({ permissions: roleBase.shape.permissions.default([]) })
/** No defaults on PATCH: renaming a role must not wipe its permissions. */
export const rolePatchSchema = roleBase.partial()

async function writeRolePermissions(ctx: StaffContext, tx: StaffContext['db'], roleId: string, keys: string[]) {
  const valid = keys.filter((k): k is PermissionKey => (PERMISSION_KEYS as string[]).includes(k)) // unknown keys are ignored
  const rows = valid.length ? await tx.select({ id: permissions.id }).from(permissions).where(inArray(permissions.key, valid)) : []
  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
  if (rows.length) await tx.insert(rolePermissions).values(rows.map(row => ({ roleId, permissionId: row.id })))
  return valid
}

export async function createRole(ctx: StaffContext, input: z.infer<typeof roleSchema>) {
  assertPermission(ctx, 'roles.write')
  const id = `role-${input.slug}`
  const [exists] = await ctx.db.select({ id: roles.id }).from(roles).where(or(eq(roles.slug, input.slug), eq(roles.id, id))).limit(1)
  if (exists) throw appError(409, 'Slug peran ini sudah dipakai.', 'CONFLICT', { field: 'slug' })
  await ctx.db.transaction(async (tx) => {
    await tx.insert(roles).values({ id, slug: input.slug, name: input.name, description: input.description ?? null })
    await writeRolePermissions(ctx, tx, id, input.permissions)
  })
  await audit(ctx, 'permission.update', { targetType: 'role', targetId: id, metadata: { created: true, permissions: input.permissions.length } })
}

export async function updateRole(ctx: StaffContext, id: string, input: z.infer<typeof rolePatchSchema>) {
  assertPermission(ctx, 'roles.write')
  const [role] = await ctx.db.select().from(roles).where(eq(roles.id, id)).limit(1)
  if (!role) throw appError(404, 'Peran tidak ditemukan.', 'NOT_FOUND')
  if (role.isSystem && input.slug && input.slug !== role.slug) throw appError(409, 'Slug peran bawaan tidak bisa diubah.', 'CONFLICT')
  if (role.isSuperAdmin && input.permissions) throw appError(409, 'Hak akses superadmin tidak bisa diubah.', 'CONFLICT')
  await ctx.db.transaction(async (tx) => {
    await tx.update(roles).set({ ...(input.name && { name: input.name }), ...(input.description !== undefined && { description: input.description }), ...(input.slug && !role.isSystem && { slug: input.slug }), updatedAt: new Date() }).where(eq(roles.id, id))
    if (input.permissions) await writeRolePermissions(ctx, tx, id, input.permissions)
  })
  if (input.permissions) await audit(ctx, 'permission.update', { targetType: 'role', targetId: id, metadata: { permissions: input.permissions.length } })
}

export async function deleteRole(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'roles.write')
  const [role] = await ctx.db.select().from(roles).where(eq(roles.id, id)).limit(1)
  if (!role) throw appError(404, 'Peran tidak ditemukan.', 'NOT_FOUND')
  if (role.isSystem) throw appError(409, 'Peran bawaan tidak bisa dihapus.', 'CONFLICT')
  const [used] = await ctx.db.select({ n: count() }).from(staffUsers).where(eq(staffUsers.roleId, id))
  if ((used?.n ?? 0) > 0) throw appError(409, 'Pindahkan staf di peran ini terlebih dahulu.', 'CONFLICT')
  await ctx.db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id))
    await tx.delete(roles).where(eq(roles.id, id))
  })
  await audit(ctx, 'role.delete', { targetType: 'role', targetId: id })
}

export async function listPermissionCatalog(ctx: StaffContext) {
  assertPermission(ctx, 'permissions.read')
  const [rows, grants] = await Promise.all([
    ctx.db.select().from(permissions).orderBy(asc(permissions.key)),
    ctx.db.select({ key: permissions.key, roleName: roles.name }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).innerJoin(roles, eq(roles.id, rolePermissions.roleId))
  ])
  const superadmins = await ctx.db.select({ name: roles.name }).from(roles).where(eq(roles.isSuperAdmin, true))
  return { items: rows.map(row => ({ ...row, roles: [...superadmins.map(r => r.name), ...grants.filter(g => g.key === row.key).map(g => g.roleName)] })) }
}

// ---------------------------------------------------------------- menus

export async function listMenus(ctx: StaffContext) {
  assertPermission(ctx, 'menus.read')
  return { items: await ctx.db.select().from(menus).orderBy(asc(menus.order)), permissionKeys: PERMISSION_KEYS }
}

const menuBase = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'Slug: huruf kecil, angka dan tanda hubung.'),
  label: z.string().trim().min(1).max(60),
  path: z.string().trim().regex(/^\/admin(\/[\w-]+)*$/, 'Alamat harus diawali /admin.').nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  permissionKey: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().int().min(0).max(999),
  isActive: z.boolean()
})
export const menuSchema = menuBase.extend({ order: menuBase.shape.order.default(0), isActive: z.boolean().default(true) })
/** No defaults on PATCH: an omitted field must never be reset (e.g. re-showing a hidden menu). */
export const menuPatchSchema = menuBase.partial()

async function depthOf(ctx: StaffContext, parentId: string | null | undefined): Promise<number> {
  let depth = 1
  let current = parentId
  while (current) {
    const [row] = await ctx.db.select({ parentId: menus.parentId }).from(menus).where(eq(menus.id, current)).limit(1)
    if (!row) throw appError(404, 'Induk menu tidak ditemukan.', 'NOT_FOUND', { field: 'parentId' })
    depth++
    current = row.parentId
  }
  return depth
}

function checkMenu(input: z.infer<typeof menuPatchSchema>) {
  if (input.permissionKey && !(PERMISSION_KEYS as string[]).includes(input.permissionKey)) throw appError(400, 'Hak akses tidak dikenal.', 'VALIDATION_FAILED', { field: 'permissionKey' })
}

export async function createMenu(ctx: StaffContext, input: z.infer<typeof menuSchema>) {
  assertPermission(ctx, 'menus.write')
  checkMenu(input)
  if (await depthOf(ctx, input.parentId) > 3) throw appError(400, 'Menu maksimal 3 tingkat.', 'VALIDATION_FAILED', { field: 'parentId' })
  const id = `menu-${input.slug}`
  const [exists] = await ctx.db.select({ id: menus.id }).from(menus).where(or(eq(menus.slug, input.slug), eq(menus.id, id))).limit(1)
  if (exists) throw appError(409, 'Slug menu ini sudah dipakai.', 'CONFLICT', { field: 'slug' })
  await ctx.db.insert(menus).values({ id, ...input, parentId: input.parentId ?? null, path: input.path ?? null, icon: input.icon ?? null, permissionKey: input.permissionKey ?? null })
  await audit(ctx, 'menu.update', { targetType: 'menu', targetId: id, metadata: { created: true } })
}

export async function updateMenu(ctx: StaffContext, id: string, input: z.infer<typeof menuPatchSchema>) {
  assertPermission(ctx, 'menus.write')
  checkMenu(input)
  if (input.parentId !== undefined) {
    if (input.parentId === id) throw appError(400, 'Menu tidak bisa menjadi induknya sendiri.', 'VALIDATION_FAILED', { field: 'parentId' })
    if (await depthOf(ctx, input.parentId) > 3) throw appError(400, 'Menu maksimal 3 tingkat.', 'VALIDATION_FAILED', { field: 'parentId' })
  }
  const { slug: _slug, ...rest } = input // slugs are stable ids
  const rows = await ctx.db.update(menus).set({ ...rest, updatedAt: new Date() }).where(eq(menus.id, id)).returning({ id: menus.id })
  if (!rows.length) throw appError(404, 'Menu tidak ditemukan.', 'NOT_FOUND')
  await audit(ctx, 'menu.update', { targetType: 'menu', targetId: id })
}

export async function deleteMenu(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'menus.write')
  const [children] = await ctx.db.select({ n: count() }).from(menus).where(eq(menus.parentId, id))
  if ((children?.n ?? 0) > 0) throw appError(409, 'Hapus atau pindahkan sub-menunya dulu.', 'CONFLICT')
  await ctx.db.delete(menus).where(eq(menus.id, id))
  await audit(ctx, 'menu.delete', { targetType: 'menu', targetId: id })
}

/** Drag to reorder: one transaction, siblings only. */
export async function reorderMenus(ctx: StaffContext, ids: string[]) {
  assertPermission(ctx, 'menus.write')
  await ctx.db.transaction(async (tx) => {
    for (const [order, id] of ids.entries()) await tx.update(menus).set({ order, updatedAt: new Date() }).where(eq(menus.id, id))
  })
}

/** Superadmin opens the back-office as another staff member: never a superadmin, never yourself, no chains. */
export async function impersonateStaff(ctx: StaffContext, targetId: string, cookieHeader: string) {
  if (!ctx.isSuperAdmin) throw appError(403, 'Hanya superadmin yang bisa menyamar.', 'FORBIDDEN')
  if (ctx.impersonatorId) throw appError(403, 'Berhenti menyamar dulu sebelum menyamar lagi.', 'FORBIDDEN')
  if (targetId === ctx.staffUserId) throw appError(409, 'Tidak bisa menyamar sebagai diri sendiri.', 'CONFLICT')
  const [target] = await ctx.db.select({ id: staffUsers.id, name: staffUsers.name, isActive: staffUsers.isActive, isSuperAdmin: roles.isSuperAdmin })
    .from(staffUsers).innerJoin(roles, eq(roles.id, staffUsers.roleId)).where(eq(staffUsers.id, targetId)).limit(1)
  if (!target) throw appError(404, 'Staf tidak ditemukan.', 'NOT_FOUND')
  if (target.isSuperAdmin) throw appError(403, 'Tidak bisa menyamar sebagai superadmin lain.', 'FORBIDDEN')
  if (!target.isActive) throw appError(409, 'Staf ini nonaktif.', 'CONFLICT')
  const result = await createStaffImpersonationSession(targetId, ctx.staffUserId, cookieHeader)
  await audit(ctx, 'staff.impersonate_start', { targetType: 'staff_user', targetId, metadata: { sessionId: result.sessionId, targetName: target.name } })
  return result
}
