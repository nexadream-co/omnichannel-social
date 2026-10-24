import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFakeChannels } from '../../server/core/channels/fake'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { dmRules, emailTemplates, notificationTemplates, appSettings, plans, postTargets, posts, subscriptionEvents, subscriptions, users } from '../../server/core/db/schema'
import { resetEnvCache } from '../../server/core/env'
import { createNotification, listNotifications } from '../../server/core/notifications'
import { provisionWorkspace } from '../../server/core/registration'
import { connectAccounts, listSocialAccounts } from '../../server/core/social-accounts'
import { getSubscriptionView, transitionSubscription } from '../../server/core/subscriptions'
import { EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES } from '../../shared/utils/templates'
import { collapseNotifications, notificationBucket } from '../../app/composables/useNotifications'
import { downgradeReason, rankAccountsToKeep } from '../../shared/utils/billing-history'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ws: WorkspaceContext
let userId: string

const fakeAccount = (externalId: string) => ({ externalId, username: `u_${externalId}`, avatarUrl: null, accessToken: 't', refreshToken: null, tokenExpiresAt: null, scopes: [], meta: {} })

beforeAll(async () => {
  process.env.ADAPTER_MODE = 'fake'
  resetEnvCache()
  for (const plan of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${plan.slug}`, ...plan }).onConflictDoNothing()
})
beforeEach(async () => {
  resetFakeChannels()
  await truncate('notifications', 'dm_rules', 'jobs', 'post_targets', 'post_media', 'posts', 'social_accounts', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'app_settings', 'audit_logs', 'email_templates', 'notification_templates')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id', emailVerified: true }).returning({ id: users.id })
  userId = user!.id
  const { workspaceId } = await provisionWorkspace(base, userId, { name: 'Rina', email: 'rina@x.id' })
  await getDb().update(subscriptions).set({ planId: 'plan-kreator', status: 'active' }).where(eq(subscriptions.workspaceId, workspaceId))
  ws = { ...base, workspaceId, userId, role: 'owner', impersonatorId: null }
})
afterAll(closeDb)

describe('listSocialAccounts usage', () => {
  it('stays cheap without usage and counts upcoming posts and active rules with it', async () => {
    const { connected } = await connectAccounts(ws, 'instagram', [fakeAccount('a1'), fakeAccount('a2')])
    const [a1, a2] = connected as [string, string]
    const [post] = await getDb().insert(posts).values({ workspaceId: ws.workspaceId, createdBy: userId, caption: 'x' }).returning({ id: posts.id })
    const future = new Date(Date.now() + 86_400_000)
    const past = new Date(Date.now() - 86_400_000)
    const target = (status: typeof postTargets.$inferInsert['status'], at: Date, accountId = a1) => ({ workspaceId: ws.workspaceId, postId: post!.id, socialAccountId: accountId, platform: 'instagram' as const, format: 'feed' as const, status, scheduledAt: at })
    await getDb().insert(postTargets).values([
      target('scheduled', future), target('draft', future), target('cancelled', future), target('published', future), target('failed', future), target('scheduled', past), target('scheduled', future, a2)
    ])
    await getDb().insert(dmRules).values([
      { workspaceId: ws.workspaceId, socialAccountId: a1, name: 'r1', dmMessage: 'hi', active: true },
      { workspaceId: ws.workspaceId, socialAccountId: a1, name: 'r2', dmMessage: 'hi', active: false }
    ] as never)

    const plain = (await listSocialAccounts(ws)).items[0]!
    expect(plain).not.toHaveProperty('upcomingPosts')

    const { items } = await listSocialAccounts(ws, { withUsage: true })
    const one = items.find(i => i.id === a1) as typeof items[number] & { upcomingPosts: number, activeRules: number }
    const two = items.find(i => i.id === a2) as typeof one
    expect(one.upcomingPosts).toBe(2)
    expect(one.activeRules).toBe(1)
    expect(two.upcomingPosts).toBe(1)
    expect(two.activeRules).toBe(0)
  })
})

describe('getSubscriptionView lastDowngrade', () => {
  it('is null while the plan is paid', async () => {
    expect((await getSubscriptionView(ws)).lastDowngrade).toBeNull()
  })

  it('reports unpaid after grace expired', async () => {
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'payment_failed' })
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'grace_expired' })
    const view = await getSubscriptionView(ws)
    expect(view.lastDowngrade).toMatchObject({ reason: 'unpaid', fromPlanSlug: 'kreator', fromPlanName: expect.any(String) })
  })

  it('reports cancelled when a cancelled plan ends', async () => {
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'cancel' })
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'grace_expired' })
    expect((await getSubscriptionView(ws)).lastDowngrade?.reason).toBe('cancelled')
  })

  it('reports trial_ended when a trial lapses', async () => {
    await getDb().update(subscriptions).set({ status: 'trialing' }).where(eq(subscriptions.workspaceId, ws.workspaceId))
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'trial_expired' })
    expect((await getSubscriptionView(ws)).lastDowngrade?.reason).toBe('trial_ended')
  })

  it('is null when the latest downgrade came from a reinstatement, not the old trial', async () => {
    await getDb().update(subscriptions).set({ status: 'trialing' }).where(eq(subscriptions.workspaceId, ws.workspaceId))
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'trial_expired' })
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'suspend' })
    await getDb().update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscriptions.workspaceId, ws.workspaceId))
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'reinstate' })
    const view = await getSubscriptionView(ws)
    expect(view.subscription.status).toBe('downgraded')
    expect(view.lastDowngrade).toBeNull()
  })

  it('goes back to null after paying again', async () => {
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'payment_failed' })
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'grace_expired' })
    await transitionSubscription({ workspaceId: ws.workspaceId, transition: 'pay', planSlug: 'kreator', period: 'monthly' })
    expect((await getSubscriptionView(ws)).lastDowngrade).toBeNull()
    expect(await getDb().select().from(subscriptionEvents).where(eq(subscriptionEvents.workspaceId, ws.workspaceId))).not.toHaveLength(0)
  })
})

describe('listNotifications templateKey', () => {
  it('returns the template key, null for ad-hoc rows', async () => {
    const ctx = { ...ws, defer: ws.defer }
    await createNotification(ctx, { audience: 'creator', userId, workspaceId: ws.workspaceId, templateKey: 'payment_failed', variables: { graceEndsAt: 'besok' }, channels: { email: false } })
    await createNotification(ctx, { audience: 'creator', userId, workspaceId: ws.workspaceId, title: 'Halo', channels: { email: false } })
    const { items } = await listNotifications(ws.db, { audience: 'creator', userId, workspaceId: ws.workspaceId }, { page: 1, limit: 10, offset: 0, search: '' })
    expect(items.map(i => i.templateKey).sort()).toEqual([null, 'payment_failed'])
  })
})

describe('migration 0013 kamu copy', () => {
  const statements = readFileSync(new URL('../../server/core/db/migrations/0013_kamu_copy.sql', import.meta.url), 'utf8')
    .split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)

  it('catalog has no formal "Anda" left', () => {
    const all = JSON.stringify({ EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES })
    expect(all).not.toMatch(/\bAnda\b/)
  })

  it('rewrites untouched defaults and leaves admin edits alone', async () => {
    const db = getDb()
    const oldBody = '<p>Halo {{name}},</p><p>Pembayaran {{amount}} untuk paket <strong>{{planName}}</strong> ({{workspaceName}}) belum berhasil. Selesaikan sebelum {{graceEndsAt}} agar paket Anda tidak turun ke Gratis.</p><p><a class="btn" href="{{billingUrl}}">Bayar sekarang</a></p>'
    const mk = (key: string, subject: string, body: string) => ({ id: `email-${key}`, key, name: key, description: '', subject, body, variables: [] })
    await db.insert(emailTemplates).values([
      mk('payment_failed', 'Pembayaran paket {{planName}} belum berhasil', oldBody),
      mk('renewal_reminder', 'Subjek buatan admin', '<p>Halo {{name}},</p><p>Paket <strong>{{planName}}</strong> untuk {{workspaceName}} berakhir pada {{periodEnd}}. Perpanjang sekarang ({{amount}}) agar postingan terjadwal tetap jalan. Membayar lebih awal tidak mengurangi sisa waktu Anda.</p><p><a class="btn" href="{{billingUrl}}">Perpanjang paket</a></p>')
    ] as never)
    await db.insert(notificationTemplates).values({ id: 'notif-subscription_downgraded', key: 'subscription_downgraded', name: 'x', title: 'Akun turun ke paket Gratis', body: 'Teks admin Anda sendiri', level: 'warning', variables: [] } as never)
    await db.insert(appSettings).values({ key: 'channels.publishing.pausedMessage', group: 'channels', type: 'text', label: 'x', value: 'Publikasi sedang dijeda sementara karena gangguan dari platform. Postingan Anda tetap terjadwal.' } as never)

    for (const stmt of statements) await db.execute(sql.raw(stmt))

    const [pf] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, 'payment_failed'))
    expect(pf!.body).toContain('paket kamu tidak turun')
    const [rr] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, 'renewal_reminder'))
    expect(rr!.subject).toBe('Subjek buatan admin')
    expect(rr!.body).toContain('sisa waktu kamu')
    const [nd] = await db.select().from(notificationTemplates).where(eq(notificationTemplates.key, 'subscription_downgraded'))
    expect(nd!.body).toBe('Teks admin Anda sendiri')
    const [msg] = await db.select().from(appSettings).where(eq(appSettings.key, 'channels.publishing.pausedMessage'))
    expect(msg!.value).toContain('Postingan kamu tetap terjadwal')
  })
})

describe('account client helpers', () => {
  it('ranks accounts to keep by what is at stake, then active, then oldest', () => {
    const a = (id: string, status: string, createdAt: string, upcomingPosts = 0, activeRules = 0) => ({ id, status, createdAt, upcomingPosts, activeRules })
    const ids = rankAccountsToKeep([
      a('quiet-old', 'active', '2026-01-01'),
      a('busy-disabled', 'disabled', '2026-02-01', 3, 0),
      a('rules', 'active', '2026-03-01', 0, 2),
      a('quiet-new', 'active', '2026-04-01'),
      a('quiet-disabled', 'disabled', '2025-01-01')
    ], 3)
    expect(ids).toEqual(['rules', 'busy-disabled', 'quiet-old'])
  })

  it('maps downgrade transitions to a reason', () => {
    expect(downgradeReason('trial_expired', 'trialing')).toBe('trial_ended')
    expect(downgradeReason('grace_expired', 'cancelled')).toBe('cancelled')
    expect(downgradeReason('grace_expired', 'past_due')).toBe('unpaid')
    expect(downgradeReason('pay', 'active')).toBeNull()
  })

  it('has an action label for every notification template, in both languages', () => {
    for (const lang of ['id', 'en']) {
      const messages = JSON.parse(readFileSync(new URL(`../../i18n/locales/${lang}.json`, import.meta.url), 'utf8'))
      for (const template of NOTIFICATION_TEMPLATES) expect(messages.notifications.actions[template.key], `${lang}:${template.key}`).toBeTruthy()
    }
  })

  it('folds consecutive identical notifications and buckets by day', () => {
    const row = (id: string, createdAt: string, title = 'Gagal', readAt: string | null = null) => ({ id, title, body: 'x', actionUrl: null, icon: null, level: 'error' as const, templateKey: 'post_failed', readAt, createdAt })
    const groups = collapseNotifications([row('1', '2026-10-24T10:00:00Z'), row('2', '2026-10-24T09:00:00Z', 'Gagal', '2026-10-24T09:30:00Z'), row('3', '2026-10-24T08:00:00Z', 'Lain')])
    expect(groups.map(g => [g.count, g.ids, g.unreadIds])).toEqual([[2, ['1', '2'], ['1']], [1, ['3'], ['3']]])
    const now = new Date(2026, 9, 24, 12)
    expect(notificationBucket(new Date(2026, 9, 24, 1).toISOString(), now)).toBe('today')
    expect(notificationBucket(new Date(2026, 9, 20, 1).toISOString(), now)).toBe('week')
    expect(notificationBucket(new Date(2026, 9, 1, 1).toISOString(), now)).toBe('older')
  })
})
