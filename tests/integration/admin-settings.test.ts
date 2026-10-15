import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getAdminSettings, updateAdminSettings } from '../../server/core/admin/settings'
import type { StaffContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { appSettings, auditLogs, notifications, roles, staffUsers } from '../../server/core/db/schema'
import { createNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from '../../server/core/notifications'
import { invalidateSettingsCache } from '../../server/core/settings'
import { MASKED_SECRET } from '../../shared/utils/settings'
import { testContext, truncate } from './helpers'

function staff(permissions: string[] = ['settings.read', 'settings.write']): StaffContext {
  return { ...testContext(), staffUserId: 'staff-1', staffName: 'Admin', permissions: new Set(permissions), isSuperAdmin: false, impersonatorId: null }
}

beforeEach(async () => {
  await truncate('app_settings', 'audit_logs', 'notifications')
  invalidateSettingsCache()
})
afterAll(closeDb)

describe('admin settings', () => {
  it('never returns a secret, keeps it on a masked save, and ignores unknown keys', async () => {
    const ctx = staff()
    expect((await getAdminSettings(ctx)).values['email.resendApiKey']).toBe('')
    await updateAdminSettings(ctx, { values: { 'email.resendApiKey': 're_123', 'nope.key': 'x' } })
    const [row] = await getDb().select().from(appSettings).where(eq(appSettings.key, 'email.resendApiKey'))
    expect(row!.value).toMatch(/^enc:v1:/)
    expect((await getAdminSettings(ctx)).values['email.resendApiKey']).toBe(MASKED_SECRET)
    await updateAdminSettings(ctx, { values: { 'email.resendApiKey': MASKED_SECRET } })
    const [after] = await getDb().select().from(appSettings).where(eq(appSettings.key, 'email.resendApiKey'))
    expect(after!.value).toBe(row!.value)
    expect(await getDb().select().from(appSettings).where(eq(appSettings.key, 'nope.key'))).toHaveLength(0)
  })

  it('rejects invalid JSON and numbers, and audits kill switches', async () => {
    const ctx = staff()
    await expect(updateAdminSettings(ctx, { values: { 'channels.links.affiliateAllowlist': '[oops' } })).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateAdminSettings(ctx, { values: { 'billing.gracePeriodDays': 'tiga' } })).rejects.toMatchObject({ statusCode: 400 })
    await updateAdminSettings(ctx, { values: { 'channels.publishing.paused': 'true' } })
    const actions = (await getDb().select({ action: auditLogs.action }).from(auditLogs)).map(r => r.action).sort()
    expect(actions).toEqual(['channels.kill_switch', 'settings.update'])
  })

  it('requires the permission', async () => {
    await expect(getAdminSettings(staff([]))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateAdminSettings(staff(['settings.read']), { values: {} })).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('notifications', () => {
  it('scopes to the recipient, counts unread over everything, and 404s on others', async () => {
    const ctx = testContext()
    const db = getDb()
    await truncate('staff_users', 'roles')
    await db.insert(roles).values({ id: 'role-t', slug: 't', name: 'T' })
    await db.insert(staffUsers).values([{ id: 'staff-a', name: 'A', email: 'a@x.id', roleId: 'role-t' }, { id: 'staff-b', name: 'B', email: 'b@x.id', roleId: 'role-t' }])
    for (const title of ['A1', 'A2', 'A3']) await createNotification(ctx, { audience: 'staff', staffUserId: 'staff-a', title, body: 'isi', channels: { email: false } })
    await createNotification(ctx, { audience: 'staff', staffUserId: 'staff-b', title: 'B1', body: '', channels: { email: false } })
    const a = { audience: 'staff' as const, userId: 'staff-a' }
    const page = await listNotifications(db, a, { page: 1, limit: 2, offset: 0, search: '' })
    expect(page.items).toHaveLength(2)
    expect(page.meta.total).toBe(3)
    expect(page.unreadCount).toBe(3)
    await markNotificationRead(db, a, page.items[0]!.id)
    expect((await listNotifications(db, a, { page: 1, limit: 20, offset: 0, search: '', unreadOnly: true })).meta.total).toBe(2)
    expect((await listNotifications(db, a, { page: 1, limit: 20, offset: 0, search: 'A3' })).meta.total).toBe(1)
    const bItem = (await listNotifications(db, { audience: 'staff', userId: 'staff-b' }, { page: 1, limit: 20, offset: 0, search: '' })).items[0]!
    await expect(markNotificationRead(db, a, bItem.id)).rejects.toMatchObject({ statusCode: 404 })
    expect(await markAllNotificationsRead(db, a)).toBe(2)
    expect((await listNotifications(db, { audience: 'staff', userId: 'staff-b' }, { page: 1, limit: 20, offset: 0, search: '' })).unreadCount).toBe(1)
  })

  it('skips a duplicate while the first is unread', async () => {
    const ctx = testContext()
    await createNotification(ctx, { audience: 'staff', staffUserId: 'staff-a', title: 'x', body: '', dedupeKey: 'k', channels: { email: false } })
    await createNotification(ctx, { audience: 'staff', staffUserId: 'staff-a', title: 'x', body: '', dedupeKey: 'k', channels: { email: false } })
    expect(await getDb().select().from(notifications).where(eq(notifications.dedupeKey, 'k'))).toHaveLength(1)
  })
})
