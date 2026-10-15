import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { normalizeEmail, PASSWORD_MIN_LENGTH } from '../../shared/utils/auth'
import type { WorkspaceRoleSlug } from '../../shared/utils/workspace-abilities'
import { recordAudit } from './audit'
import { assertAbility, type CoreContext, type WorkspaceContext } from './context'
import { accounts, users, workspaceInvitations, workspaceMembers, workspaces } from './db/schema'
import { randomToken, sha256 } from './crypto'
import { sendTemplatedEmail } from './email'
import { assertWithinLimit, getEntitlements, invalidateEntitlements, requireEntitlement } from './entitlements'
import { env } from './env'
import { appError } from './errors'
import { createNotification } from './notifications'
import { revokeAllSessions } from './services/auth'
import type { SignUpPort } from './registration'

const INVITE_TTL_MS = 7 * 86_400_000
const ROLE_LABEL: Record<WorkspaceRoleSlug, string> = { owner: 'Pemilik', editor: 'Editor', viewer: 'Pemantau' }
const ROLE_SUMMARY: Record<WorkspaceRoleSlug, string> = {
  owner: 'Akses penuh, termasuk akun media sosial, langganan dan pembayaran.',
  editor: 'Membuat dan menjadwalkan postingan, mengelola link produk, Etalase dan Balas Otomatis.',
  viewer: 'Hanya melihat postingan dan statistik.'
}

const dateFormat = (tz: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz })

async function seatUsage(ctx: Pick<CoreContext, 'db'>, workspaceId: string) {
  const [[members], [pending]] = await Promise.all([
    ctx.db.select({ n: count() }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.isActive, true))),
    ctx.db.select({ n: count() }).from(workspaceInvitations)
      .where(and(eq(workspaceInvitations.workspaceId, workspaceId), isNull(workspaceInvitations.acceptedAt), isNull(workspaceInvitations.revokedAt), gt(workspaceInvitations.expiresAt, new Date())))
  ])
  return { active: members?.n ?? 0, pending: pending?.n ?? 0 }
}

/** Another non-deleted workspace (active OR inactive membership) blocks the address (docs/blueprint/05 §1 rule 3). */
async function otherWorkspaceOf(ctx: Pick<CoreContext, 'db'>, userId: string, workspaceId: string) {
  const [row] = await ctx.db.select({ name: workspaces.name }).from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), ne(workspaceMembers.workspaceId, workspaceId), isNull(workspaces.deletedAt)))
    .limit(1)
  return row?.name ?? null
}

export async function listTeam(ctx: WorkspaceContext) {
  assertAbility(ctx, 'team.manage')
  const members = await ctx.db.select({
    id: workspaceMembers.id, role: workspaceMembers.role, isActive: workspaceMembers.isActive, createdAt: workspaceMembers.createdAt,
    userId: users.id, name: users.name, email: users.email, image: users.image, lastSeenAt: users.lastSeenAt, lastLoginAt: users.lastLoginAt
  }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, ctx.workspaceId)).orderBy(workspaceMembers.createdAt)
  const invitations = await ctx.db.select({ id: workspaceInvitations.id, email: workspaceInvitations.email, name: workspaceInvitations.name, role: workspaceInvitations.role, expiresAt: workspaceInvitations.expiresAt, createdAt: workspaceInvitations.createdAt })
    .from(workspaceInvitations)
    .where(and(eq(workspaceInvitations.workspaceId, ctx.workspaceId), isNull(workspaceInvitations.acceptedAt), isNull(workspaceInvitations.revokedAt), gt(workspaceInvitations.expiresAt, new Date())))
    .orderBy(desc(workspaceInvitations.createdAt))
  return { members, invitations, seats: await teamSeatSummary(ctx) }
}

export async function teamSeatSummary(ctx: WorkspaceContext) {
  const usage = await seatUsage(ctx, ctx.workspaceId)
  const { limits } = await getEntitlements(ctx.workspaceId, undefined, ctx.db)
  return { used: usage.active, pending: usage.pending, limit: limits.teamMembers }
}

export const inviteSchema = z.object({
  email: z.email('Format email tidak valid.'),
  name: z.string().trim().max(100).optional(),
  role: z.enum(['editor', 'viewer'], { error: 'Pilih peran.' })
})

export async function inviteMember(ctx: WorkspaceContext, input: z.infer<typeof inviteSchema>) {
  assertAbility(ctx, 'team.manage')
  await requireEntitlement(ctx, 'teamAccess')
  const usage = await seatUsage(ctx, ctx.workspaceId)
  await assertWithinLimit(ctx, 'teamMembers', usage.active + usage.pending)
  const email = normalizeEmail(input.email)
  const [existing] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    const [member] = await ctx.db.select({ id: workspaceMembers.id }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, existing.id))).limit(1)
    if (member) throw appError(409, 'Orang ini sudah ada di tim kamu.', 'CONFLICT', { field: 'email' })
    // The inviter only learns THAT the address belongs elsewhere, never where.
    if (await otherWorkspaceOf(ctx, existing.id, ctx.workspaceId)) throw appError(409, 'Email ini sudah terdaftar di akun Socialz.id lain.', 'CONFLICT', { field: 'email' })
  }
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await ctx.db.insert(workspaceInvitations).values({ workspaceId: ctx.workspaceId, email, name: input.name || null, role: input.role, tokenHash: sha256(token), invitedById: ctx.userId, expiresAt })
    .onConflictDoUpdate({
      target: [workspaceInvitations.workspaceId, workspaceInvitations.email],
      set: { role: input.role, name: input.name || null, tokenHash: sha256(token), invitedById: ctx.userId, expiresAt, acceptedAt: null, revokedAt: null, updatedAt: new Date() }
    })
  const [workspace] = await ctx.db.select({ name: workspaces.name, timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId))
  const [inviter] = ctx.userId ? await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, ctx.userId)) : []
  ctx.defer(sendTemplatedEmail(ctx, 'workspace_invitation', email, {
    name: input.name || email,
    inviterName: inviter?.name ?? 'Pemilik akun',
    workspaceName: workspace?.name,
    roleName: `${ROLE_LABEL[input.role]} (${ROLE_SUMMARY[input.role]})`,
    inviteUrl: `${env().siteUrl}/app/auth/accept-invite?token=${token}`,
    expiresAt: dateFormat(workspace?.timezone ?? 'Asia/Jakarta').format(expiresAt)
  }))
  await recordAudit(ctx, { audience: 'creator', action: 'team.invite', workspaceId: ctx.workspaceId, metadata: { userId: ctx.userId, email, role: input.role } })
  return { success: true }
}

export async function revokeInvitation(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'team.manage')
  const rows = await ctx.db.update(workspaceInvitations).set({ revokedAt: new Date() })
    .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, ctx.workspaceId), isNull(workspaceInvitations.acceptedAt), isNull(workspaceInvitations.revokedAt)))
    .returning({ email: workspaceInvitations.email })
  if (!rows.length) throw appError(404, 'Undangan tidak ditemukan.', 'NOT_FOUND')
  await recordAudit(ctx, { audience: 'creator', action: 'team.invite_revoke', workspaceId: ctx.workspaceId, metadata: { userId: ctx.userId, email: rows[0]!.email } })
  return { success: true }
}

export const memberUpdateSchema = z.object({
  role: z.enum(['editor', 'viewer']).optional(),
  isActive: z.boolean().optional()
})

export async function updateMember(ctx: WorkspaceContext, memberId: string, input: z.infer<typeof memberUpdateSchema>) {
  assertAbility(ctx, 'team.manage')
  const [member] = await ctx.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, ctx.workspaceId))).limit(1)
  if (!member) throw appError(404, 'Anggota tidak ditemukan.', 'NOT_FOUND')
  if (member.role === 'owner') throw appError(409, 'Peran pemilik tidak bisa diubah di sini.', 'CONFLICT')
  if (member.userId === ctx.userId) throw appError(409, 'Kamu tidak bisa mengubah aksesmu sendiri.', 'CONFLICT')
  if (input.isActive === true && !member.isActive) {
    if (await otherWorkspaceOf(ctx, member.userId, ctx.workspaceId)) throw appError(409, 'Orang ini sekarang aktif di akun Socialz.id lain.', 'CONFLICT')
    await assertWithinLimit(ctx, 'teamMembers', (await seatUsage(ctx, ctx.workspaceId)).active)
  }
  await ctx.db.update(workspaceMembers).set({ ...input, updatedAt: new Date() }).where(eq(workspaceMembers.id, memberId))
  if (input.role && input.role !== member.role) {
    await recordAudit(ctx, { audience: 'creator', action: 'team.role_change', workspaceId: ctx.workspaceId, targetType: 'member', targetId: memberId, metadata: { userId: ctx.userId, from: member.role, to: input.role } })
  }
  if (input.isActive !== undefined && input.isActive !== member.isActive) {
    await recordAudit(ctx, { audience: 'creator', action: input.isActive ? 'team.reactivate' : 'team.deactivate', workspaceId: ctx.workspaceId, targetType: 'member', targetId: memberId, metadata: { userId: ctx.userId } })
    if (!input.isActive) await revokeAllSessions(member.userId, 'creator')
  }
  await invalidateEntitlements(ctx.workspaceId, ctx.db)
  return { success: true }
}

async function findInvitation(ctx: Pick<CoreContext, 'db'>, token: string) {
  const [row] = await ctx.db.select({ invitation: workspaceInvitations, workspaceName: workspaces.name, workspaceDeleted: workspaces.deletedAt })
    .from(workspaceInvitations).innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
    .where(eq(workspaceInvitations.tokenHash, sha256(token))).limit(1)
  if (!row || row.invitation.acceptedAt || row.invitation.revokedAt || row.workspaceDeleted || row.invitation.expiresAt < new Date()) {
    throw appError(400, 'Undangan sudah tidak berlaku.', 'VALIDATION_FAILED')
  }
  return row
}

/** What the accept page shows before asking for anything. Password is asked only when the account can't sign in. */
export async function previewInvitation(ctx: Pick<CoreContext, 'db'>, token: string) {
  const { invitation, workspaceName } = await findInvitation(ctx, token)
  const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email)).limit(1)
  const credentials = user ? await ctx.db.select({ providerId: accounts.providerId, password: accounts.password }).from(accounts).where(eq(accounts.userId, user.id)) : []
  const canSignIn = credentials.some(c => c.password || c.providerId === 'google')
  return {
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    workspaceName,
    expiresAt: invitation.expiresAt,
    accountExists: Boolean(user),
    needsPassword: !canSignIn,
    // The invitee owns this address, so they may learn the other workspace's name.
    otherWorkspaceName: user ? await otherWorkspaceOf(ctx, user.id, invitation.workspaceId) : null
  }
}

export const acceptSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100).optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH, 'Kata sandi minimal 8 karakter.').max(128).optional()
})

export async function acceptInvitation(ctx: CoreContext, input: z.infer<typeof acceptSchema>, headers: Headers, auth: SignUpPort) {
  const { invitation, workspaceName } = await findInvitation(ctx, input.token)
  const workspaceCtx = { db: ctx.db, workspaceId: invitation.workspaceId }
  await assertWithinLimit(workspaceCtx, 'teamMembers', (await seatUsage(ctx, invitation.workspaceId)).active)
  const preview = await previewInvitation(ctx, input.token)
  if (preview.otherWorkspaceName) throw appError(409, `Email ini sudah dipakai di ${preview.otherWorkspaceName}. Satu akun hanya bisa di satu ruang kerja.`, 'CONFLICT')

  let userId: string
  let setCookie: string[] = []
  let created = false
  const [existing] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email)).limit(1)
  if (existing && !preview.needsPassword) {
    userId = existing.id // an invitation never overwrites someone's credentials
  } else {
    if (!input.password) throw appError(400, 'Buat kata sandi untuk akunmu.', 'VALIDATION_FAILED', { field: 'password' })
    if (existing) throw appError(409, 'Akun ini belum bisa masuk. Hubungi tim Socialz.id.', 'CONFLICT')
    const result = await auth.signUp({ name: input.name || invitation.name || invitation.email.split('@')[0]!, email: invitation.email, password: input.password }, headers)
    userId = result.userId
    setCookie = result.setCookie
    created = true
  }

  try {
    await ctx.db.transaction(async (tx) => {
      // The emailed link proves the address.
      if (created) await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId))
      await tx.insert(workspaceMembers).values({ workspaceId: invitation.workspaceId, userId, role: invitation.role, isActive: true, invitedById: invitation.invitedById })
        .onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role: invitation.role, isActive: true, updatedAt: new Date() } })
      const accepted = await tx.update(workspaceInvitations).set({ acceptedAt: new Date() })
        .where(and(eq(workspaceInvitations.id, invitation.id), isNull(workspaceInvitations.acceptedAt))).returning({ id: workspaceInvitations.id })
      if (!accepted.length) throw appError(400, 'Undangan sudah tidak berlaku.', 'VALIDATION_FAILED')
    })
  } catch (error) {
    if (created) await auth.deleteUser(userId).catch(() => undefined)
    throw error
  }

  await recordAudit(ctx, { audience: 'creator', action: 'team.invite_accept', workspaceId: invitation.workspaceId, metadata: { userId, role: invitation.role } })
  await invalidateEntitlements(invitation.workspaceId, ctx.db)
  const [owner] = await ctx.db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, invitation.workspaceId), eq(workspaceMembers.role, 'owner'), eq(workspaceMembers.isActive, true))).limit(1)
  const [member] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, userId))
  if (owner) {
    await createNotification(ctx, {
      audience: 'creator', userId: owner.userId, workspaceId: invitation.workspaceId, templateKey: 'team_invite_accepted',
      variables: { memberName: member?.name, roleName: ROLE_LABEL[invitation.role], workspaceName }, channels: { email: false }
    }).catch(error => ctx.log.warn('team.notify_failed', { error }))
  }
  return { setCookie, signInRequired: !created, email: invitation.email }
}
