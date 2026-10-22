import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFaq, createPage, faqPatchSchema, faqSchema, getPageForEdit, listAuditLogs, listFaqs, listMessages, listPages, pagePatchSchema, sanitizePageHtml, updateFaq, updateMessageStatus, updatePage } from '../../server/core/admin/content'
import { adminDashboard, adminReports, jobsOverview } from '../../server/core/admin/overview'
import { listBioPagesAdmin, listMetaWebhooks, listPublishFailures, listShortLinksAdmin, listSocialAccountsAdmin, setLinkActive } from '../../server/core/admin/operations'
import { acceptStaffInvitation, createMenu, createRole, deleteMenu, deleteRole, inviteStaff, listCreatorUsers, listMenus, listPermissionCatalog, listRoles, listStaff, menuPatchSchema, rolePatchSchema, updateRole, updateStaff } from '../../server/core/admin/people'
import { getWorkspaceDetail, impersonateCreator, listWorkspaces, overridePlan, reinstateWorkspace, suspendWorkspace } from '../../server/core/admin/workspaces'
import type { StaffContext, WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { contactMessages, faqs, menus, pages, permissions, plans, postTargets, posts, roles, sessions, shortLinks, socialAccounts, staffAccounts, staffInvitations, staffUsers, subscriptionEvents, subscriptions, users, workspaces } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { createLink } from '../../server/core/links/service'
import { provisionWorkspace } from '../../server/core/registration'
import { readSession } from '../../server/core/services/auth'
import { connectAccounts } from '../../server/core/social-accounts'
import { PERMISSION_KEYS } from '../../shared/utils/permissions'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
let staff: StaffContext
const ALL = new Set<string>(PERMISSION_KEYS)

function staffCtx(overrides: Partial<StaffContext> = {}): StaffContext {
  return { ...testContext(), staffUserId: 'staff-admin', staffName: 'Admin', permissions: ALL, isSuperAdmin: false, impersonatorId: null, ...overrides }
}

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
  for (const key of PERMISSION_KEYS) await getDb().insert(permissions).values({ key, group: key.split('.')[0]!, description: key }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('staff_invitations', 'staff_accounts', 'staff_sessions', 'staff_users', 'role_permissions', 'roles', 'menus', 'pages', 'contact_messages', 'sessions', 'link_clicks', 'short_links', 'links',
    'post_targets', 'posts', 'social_accounts', 'jobs', 'notifications', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs')
  await getDb().insert(roles).values([
    { id: 'role-superadmin', slug: 'superadmin', name: 'Superadmin', isSuperAdmin: true, isSystem: true },
    { id: 'role-admin', slug: 'admin', name: 'Admin', isSystem: true },
    { id: 'role-support', slug: 'support', name: 'Support', isSystem: true }
  ])
  await getDb().insert(staffUsers).values({ id: 'staff-admin', name: 'Admin', email: 'admin@x.id', roleId: 'role-admin' })
  staff = staffCtx()
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ws = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
})
afterAll(closeDb)

describe('workspaces', () => {
  it('suspend pauses; reinstate fails posts whose time passed and re-queues future ones', async () => {
    const [accountId] = (await connectAccounts(ws, 'threads', [{ externalId: 'th-1', username: 'rina', avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])).connected
    const [post] = await getDb().insert(posts).values({ workspaceId: ws.workspaceId, baseCaption: 'x', status: 'scheduled' }).returning()
    await getDb().insert(postTargets).values([
      { workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: accountId!, platform: 'threads', format: 'text', status: 'scheduled', scheduledAt: new Date(Date.now() - 3_600_000) },
      { workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: accountId!, platform: 'threads', format: 'text', status: 'scheduled', scheduledAt: new Date(Date.now() + 3_600_000) }
    ])
    await suspendWorkspace(staff, ws.workspaceId, 'Spam berulang')
    expect((await getDb().select().from(workspaces).where(eq(workspaces.id, ws.workspaceId)))[0]).toMatchObject({ status: 'suspended', suspendedReason: 'Spam berulang' })
    expect((await getDb().select().from(subscriptions))[0]!.status).toBe('suspended')
    await expect(suspendWorkspace(staff, ws.workspaceId, 'lagi')).rejects.toMatchObject({ statusCode: 409 })

    expect(await reinstateWorkspace(staff, ws.workspaceId)).toEqual({ missed: 1, rescheduled: 1 })
    const targets = await getDb().select().from(postTargets).orderBy(postTargets.scheduledAt)
    expect(targets.map(t => t.status)).toEqual(['failed', 'scheduled'])
    expect(targets[0]!.lastErrorMsg).toBe('Terlewat saat akun ditangguhkan')
    expect(targets[1]!.jobId).toBeTruthy()
    expect((await getDb().select().from(subscriptions))[0]!.status).toBe('downgraded') // no paid period left
  })

  it('plan override is audited as admin_override and enforces limits', async () => {
    for (let i = 1; i <= 3; i++) await connectAccounts(ws, 'threads', [{ externalId: `th-${i}`, username: `a${i}`, avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} }])
    await overridePlan(staff, ws.workspaceId, { planSlug: 'gratis', period: 'monthly', status: 'downgraded', note: 'test' })
    const events = await getDb().select().from(subscriptionEvents).where(eq(subscriptionEvents.workspaceId, ws.workspaceId))
    expect(events.at(-1)).toMatchObject({ transition: 'admin_override', toPlanSlug: 'gratis', toStatus: 'downgraded' })
    expect((await getDb().select().from(socialAccounts)).filter(a => a.status === 'disabled')).toHaveLength(1)
    await expect(overridePlan(staffCtx({ permissions: new Set(['workspaces.read']) }), ws.workspaceId, { planSlug: 'kreator', period: 'monthly', status: 'active' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('impersonation is superadmin-only and creates a short, marked creator session', async () => {
    await expect(impersonateCreator(staff, { workspaceId: ws.workspaceId })).rejects.toMatchObject({ statusCode: 403 })
    const { setCookie } = await impersonateCreator(staffCtx({ isSuperAdmin: true }), { workspaceId: ws.workspaceId })
    const cookie = setCookie.split(';')[0]!
    const session = await readSession(new Headers({ cookie }), 'creator')
    expect(session).toMatchObject({ userId: ws.userId, impersonatedBy: 'staff-admin', activeWorkspaceId: ws.workspaceId })
    expect(session!.expiresAt.getTime()).toBeLessThan(Date.now() + 61 * 60_000)
    expect(await getDb().select().from(sessions)).toHaveLength(1)
  })
})

describe('staff, roles, menus', () => {
  it('invite → accept creates a staff login; only superadmins grant superadmin', async () => {
    await expect(inviteStaff(staff, { email: 'boss@x.id', roleId: 'role-superadmin' })).rejects.toMatchObject({ statusCode: 403 })
    const capture = staffCtx({ defer: () => undefined })
    await inviteStaff(capture, { email: 'Sinta@X.id', name: 'Sinta', roleId: 'role-support' })
    const [invite] = await getDb().select().from(staffInvitations)
    expect(invite!.email).toBe('sinta@x.id')
    // The raw token only travels in the email; recreate one for the test.
    const token = 'test-token-1234567890'
    const { createHash } = await import('node:crypto')
    await getDb().update(staffInvitations).set({ tokenHash: createHash('sha256').update(token).digest('hex') })
    await acceptStaffInvitation(testContext(), { token, name: 'Sinta Dewi', password: 'rahasia123' })
    const [user] = await getDb().select().from(staffUsers).where(eq(staffUsers.email, 'sinta@x.id'))
    expect(user).toMatchObject({ name: 'Sinta Dewi', roleId: 'role-support' })
    expect((await getDb().select().from(staffAccounts).where(eq(staffAccounts.userId, user!.id)))[0]!.password).toBeTruthy()
    await expect(acceptStaffInvitation(testContext(), { token, name: 'Again', password: 'rahasia123' })).rejects.toMatchObject({ statusCode: 410 })
  })

  it('you cannot deactivate yourself or change your own role', async () => {
    await expect(updateStaff(staff, 'staff-admin', { isActive: false })).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateStaff(staff, 'staff-admin', { roleId: 'role-support' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('system roles stay; superadmin permissions are fixed; a role in use cannot be deleted', async () => {
    await expect(deleteRole(staff, 'role-admin')).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateRole(staff, 'role-superadmin', { permissions: [] })).rejects.toMatchObject({ statusCode: 409 })
    await createRole(staff, { slug: 'finance', name: 'Keuangan', permissions: ['payments.read', 'unknown.key'] })
    await getDb().insert(staffUsers).values({ name: 'F', email: 'f@x.id', roleId: 'role-finance' })
    await expect(deleteRole(staff, 'role-finance')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('menus: at most three levels, and a parent with children cannot be deleted', async () => {
    await createMenu(staff, { slug: 'a', label: 'A', order: 0, isActive: true })
    await createMenu(staff, { slug: 'b', label: 'B', parentId: 'menu-a', order: 0, isActive: true })
    await createMenu(staff, { slug: 'c', label: 'C', parentId: 'menu-b', path: '/admin/c', order: 0, isActive: true })
    await expect(createMenu(staff, { slug: 'd', label: 'D', parentId: 'menu-c', order: 0, isActive: true })).rejects.toMatchObject({ statusCode: 400 })
    await expect(deleteMenu(staff, 'menu-a')).rejects.toMatchObject({ statusCode: 409 })
    expect(await getDb().select().from(menus)).toHaveLength(3)
  })
})

describe('content and moderation', () => {
  it('page HTML is sanitized and privacy/terms stay published', async () => {
    expect(sanitizePageHtml('<p onclick="x()">Hai<script>alert(1)</script> <a href="javascript:x">a</a></p>')).toBe('<p>Hai <a rel="noopener nofollow">a</a></p>')
    const { id } = await createPage(staff, { slug: 'privacy', title: 'Kebijakan Privasi', content: '<p>Isi</p>', isPublished: true })
    await expect(updatePage(staff, id, { isPublished: false })).rejects.toMatchObject({ statusCode: 409 })
    await updatePage(staff, id, { content: '<h2>Data</h2><img src="x" onerror="y">' })
    expect((await getPageForEdit(staff, id)).content).toBe('<h2>Data</h2><img src="x" />')
    expect(await getDb().select().from(pages)).toHaveLength(1)
  })

  it('a partial update never resets fields it leaves out', async () => {
    expect(faqPatchSchema.parse({ isActive: false })).toEqual({ isActive: false })
    expect(pagePatchSchema.parse({ title: 'Baru' })).toEqual({ title: 'Baru' })
    expect(rolePatchSchema.parse({ name: 'Editor konten' })).toEqual({ name: 'Editor konten' })
    expect(menuPatchSchema.parse({ label: 'Menu' })).toEqual({ label: 'Menu' })
    // The FAQ "Tampilkan" switch sends only isActive.
    await getDb().delete(faqs)
    await createFaq(staff, faqSchema.parse({ question: 'Apa itu Etalase?', answer: 'Halaman link di bio.', category: 'etalase', order: 4 }))
    const [faq] = await getDb().select().from(faqs)
    await updateFaq(staff, faq!.id, faqPatchSchema.parse({ isActive: false }))
    expect((await getDb().select().from(faqs))[0]).toMatchObject({ category: 'etalase', order: 4, isActive: false })
    await getDb().delete(faqs)
  })

  it('message handledAt is set on the first non-new status and cleared back on new', async () => {
    const [m] = await getDb().insert(contactMessages).values({ name: 'A', email: 'a@x.id', message: 'Halo' }).returning()
    await updateMessageStatus(staff, m!.id, 'read')
    const first = (await getDb().select().from(contactMessages))[0]!.handledAt
    expect(first).toBeTruthy()
    await updateMessageStatus(staff, m!.id, 'replied')
    expect((await getDb().select().from(contactMessages))[0]!.handledAt!.getTime()).toBe(first!.getTime())
    await updateMessageStatus(staff, m!.id, 'new')
    expect((await getDb().select().from(contactMessages))[0]!.handledAt).toBeNull()
  })

  it('disabling a product link disables every short link of that product', async () => {
    const { link } = await createLink(ws, { destinationUrl: 'https://s.shopee.co.id/zz', showInBio: false })
    const [vault] = await getDb().select().from(shortLinks).where(eq(shortLinks.linkId, link.id))
    await getDb().insert(shortLinks).values({ workspaceId: ws.workspaceId, slug: 'dm-copy-1', domain: 'x', linkId: link.id, source: 'dm' })
    await setLinkActive(staff, vault!.id, false, 'Penipuan')
    expect((await getDb().select().from(shortLinks)).every(s => !s.active)).toBe(true)
    await setLinkActive(staff, vault!.id, true)
    expect((await getDb().select().from(shortLinks)).every(s => s.active)).toBe(true)
  })
})

describe('every back-office query runs (SQL smoke test)', () => {
  it('lists, detail, dashboard, reports and jobs return without errors', async () => {
    const page = { page: 1, limit: 10, search: 'a' }
    await createLink(ws, { destinationUrl: 'https://s.shopee.co.id/smoke', showInBio: false })
    const results = await Promise.all([
      listWorkspaces(staff, { ...page, status: 'all', planSlug: 'all', subscriptionStatus: 'all', deleteRequested: 'all' }),
      getWorkspaceDetail(staff, ws.workspaceId),
      listCreatorUsers(staff, page),
      listStaff(staff, page),
      listRoles(staff),
      listPermissionCatalog(staff),
      listMenus(staff),
      listAuditLogs(staff, { ...page, search: '', action: '', audience: 'all', range: '30d' }),
      listPages(staff),
      listFaqs(staff),
      listMessages(staff, { ...page, status: 'all' }),
      listPublishFailures(staff, { ...page, platform: 'all', errorCode: '', range: '7d' }),
      listSocialAccountsAdmin(staff, { ...page, platform: 'all', status: 'all', expiringWithinDays: 7 }),
      listShortLinksAdmin(staff, { ...page, search: '', flagged: 'outside' }),
      listBioPagesAdmin(staff, page),
      listMetaWebhooks(staff, { ...page, state: 'all', topic: '' }),
      adminDashboard(staff),
      adminReports(staff, { period: 'week', limit: 4 }),
      adminReports(staff, { period: 'day', limit: 3 }),
      jobsOverview(staff)
    ])
    expect(results).toHaveLength(20)
    expect((await listCreatorUsers(staff, { page: 1, limit: 10, search: '' })).items[0]).toMatchObject({ email: 'rina@x.id', memberships: [{ role: 'owner' }] })
    expect((await adminReports(staff, { period: 'month', limit: 2 })).series).toHaveLength(2)
  })
})
