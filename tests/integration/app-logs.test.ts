import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAppLogs } from '../../server/core/admin/logs'
import { flushLogs } from '../../server/core/app-logs'
import type { StaffContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { appLogs, users } from '../../server/core/db/schema'
import { createLogger, takeBufferedLogs } from '../../server/core/log'
import { supportPermissionKeys, adminPermissionKeys } from '../../shared/utils/permissions'
import { testContext, truncate } from './helpers'

function staff(permissions: string[]): StaffContext {
  return { ...testContext(), staffUserId: 'staff-1', staffName: 'Admin', permissions: new Set(permissions), isSuperAdmin: false, impersonatorId: null }
}
const query = { page: 1, limit: 50, search: '', user: '', level: 'all' as const, range: '7d' as const }

beforeEach(async () => {
  await truncate('app_logs', 'users')
  takeBufferedLogs()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(closeDb)

describe('app logs', () => {
  it('stores warn and error lines with who hit them, and leaves info on stdout', async () => {
    const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
    const logger = createLogger({ requestId: 'req-1', path: '/api/app/channels/instagram/callback?code=x' }).child({ workspaceId: 'ws-1', userId: user!.id })
    logger.info('channels.connected')
    logger.warn('channels.connect_failed', { platform: 'instagram', reason: 'exchange', message: 'Invalid OAuth access token', accessToken: 'abc' })
    createLogger().error('request.error', { error: new Error('boom') })
    await flushLogs()

    const rows = await getDb().select().from(appLogs)
    expect(rows.map(row => row.msg).sort()).toEqual(['channels.connect_failed', 'request.error'])
    const failed = rows.find(row => row.msg === 'channels.connect_failed')!
    expect(failed).toMatchObject({ level: 'warn', userId: user!.id, workspaceId: 'ws-1', requestId: 'req-1', path: '/api/app/channels/instagram/callback?code=x' })
    expect(failed.fields).toEqual({ platform: 'instagram', reason: 'exchange', message: 'Invalid OAuth access token', accessToken: '[redacted]' })

    const admin = staff(adminPermissionKeys())
    const byEmail = await listAppLogs(admin, { ...query, user: 'rina@' })
    expect(byEmail.items.map(item => [item.msg, item.userEmail])).toEqual([['channels.connect_failed', 'rina@x.id']])
    expect((await listAppLogs(admin, { ...query, level: 'error' })).items.map(item => item.msg)).toEqual(['request.error'])
    expect((await listAppLogs(admin, { ...query, search: 'OAuth access' })).meta.total).toBe(1)
  })

  it('is for admins only: Support does not get logs.read', async () => {
    expect(adminPermissionKeys()).toContain('logs.read')
    expect(supportPermissionKeys()).not.toContain('logs.read')
    await expect(listAppLogs(staff(supportPermissionKeys()), query)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('never throws when the table cannot be written', async () => {
    createLogger().warn('something')
    const broken = { insert: () => ({ values: () => Promise.reject(new Error('relation does not exist')) }) }
    await expect(flushLogs(broken as never)).resolves.toBeUndefined()
  })
})
