import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { workspaceAnalytics } from '../../server/core/analytics/service'
import { createBio, createBioSchema, getPublicBio, setBioPublished } from '../../server/core/bio/service'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { bioItems, linkClicks, plans, shortLinks, subscriptions, users } from '../../server/core/db/schema'
import { invalidateEntitlements } from '../../server/core/entitlements'
import { recordClick, resolveSlug } from '../../server/core/links/clicks'
import { attributeCaption, createLink, shortUrl, updateLink } from '../../server/core/links/service'
import { provisionWorkspace } from '../../server/core/registration'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

let ctx: WorkspaceContext

async function plan(slug: 'gratis' | 'kreator') {
  await getDb().update(subscriptions).set({ planId: `plan-${slug}`, status: slug === 'gratis' ? 'downgraded' : 'active' }).where(eq(subscriptions.workspaceId, ctx.workspaceId))
  await invalidateEntitlements(ctx.workspaceId)
}

const click = (shortLinkId: string, extra: Partial<Parameters<typeof recordClick>[1]> = {}) => recordClick(getDb(), {
  shortLinkId, workspaceId: ctx.workspaceId, ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Instagram 300.0', method: 'GET', purpose: null, referrer: null, country: 'ID', region: 'Jawa Barat', city: 'Bandung', ...extra
})

beforeAll(async () => {
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('link_clicks', 'ip_salts', 'bio_items', 'bio_categories', 'bio_pages', 'short_links', 'links', 'jobs', 'rate_limit_buckets', 'trial_claims', 'subscription_events', 'subscriptions', 'workspace_members', 'workspaces', 'users', 'audit_logs', 'app_settings')
  const base = testContext()
  const [user] = await getDb().insert(users).values({ name: 'Rina', email: 'rina@x.id' }).returning({ id: users.id })
  const { workspaceId } = await provisionWorkspace(base, user!.id, { name: 'Rina', email: 'rina@x.id' })
  ctx = { ...base, workspaceId, userId: user!.id, role: 'owner', impersonatorId: null }
})
afterAll(closeDb)

describe('product links', () => {
  it('Gratis: affiliate domains only, custom names ignored with a hint (degrade, not refuse)', async () => {
    await plan('gratis')
    await expect(createLink(ctx, { destinationUrl: 'https://myblog.example/item', showInBio: false })).rejects.toMatchObject({ statusCode: 402, data: { feature: 'anyDestination' } })
    const { link, customIgnored } = await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/abc', customSlug: 'promo-ku', showInBio: false })
    expect(link.merchant).toBe('shopee')
    expect(customIgnored).toBe(true)
    expect(link.slug).toMatch(/^[0-9A-Za-z]{6}$/)
  })

  it('Kreator: any destination and custom names', async () => {
    await plan('kreator')
    const { link } = await createLink(ctx, { destinationUrl: 'https://myblog.example/item', customSlug: 'promo-ku', showInBio: false })
    expect(link.shortUrl).toBe(shortUrl('promo-ku'))
    await expect(createLink(ctx, { destinationUrl: 'https://tokopedia.com/x', customSlug: 'promo-ku', showInBio: false })).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('redirect + clicks', () => {
  it('resolves slugs, keeps redirecting archived products, counts one unique per visitor per day and skips bots', async () => {
    await plan('kreator')
    const { link } = await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/xyz', showInBio: false })
    const resolved = await resolveSlug(getDb(), link.slug!)
    expect(resolved?.destinationUrl).toBe('https://s.shopee.co.id/xyz')
    await updateLink(ctx, link.id, { archived: true })
    await click(resolved!.shortLinkId)
    await click(resolved!.shortLinkId)
    await click(resolved!.shortLinkId, { userAgent: 'facebookexternalhit/1.1' })
    const rows = await getDb().select().from(linkClicks)
    expect(rows).toHaveLength(3)
    expect(rows.filter(r => r.isUniqueDay)).toHaveLength(1)
    expect(rows.filter(r => r.isBot)).toHaveLength(1)
    expect(rows[0]).toMatchObject({ inApp: 'ig', device: 'phone', os: 'ios', city: 'Bandung' })
    expect(rows.every(r => r.ipHash && !r.ipHash.includes('203.0.113.7'))).toBe(true)
    const stats = await workspaceAnalytics(ctx, { days: 7 })
    expect(stats.totals).toEqual({ clicks: 2, uniques: 1 })
  })

  it('unknown slugs resolve to null', async () => {
    expect(await resolveSlug(getDb(), 'nope00')).toBeNull()
  })

  it('attribution: one short link per (target, product), idempotent', async () => {
    await plan('kreator')
    const { link } = await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/a1', showInBio: false })
    const caption = `Beli di ${link.shortUrl} sekarang!`
    const { posts, postTargets, socialAccounts } = await import('../../server/core/db/schema')
    const [account] = await getDb().insert(socialAccounts).values({ workspaceId: ctx.workspaceId, platform: 'threads', externalId: 't1' }).returning()
    const [post] = await getDb().insert(posts).values({ workspaceId: ctx.workspaceId }).returning()
    const [target] = await getDb().insert(postTargets).values({ workspaceId: ctx.workspaceId, postId: post!.id, socialAccountId: account!.id, platform: 'threads', format: 'text' }).returning()
    const first = await attributeCaption(getDb(), target!, caption)
    const second = await attributeCaption(getDb(), target!, caption)
    expect(first).toBe(second)
    expect(first).not.toContain(link.shortUrl!)
    const rows = await getDb().select().from(shortLinks).where(eq(shortLinks.postTargetId, target!.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'post', channel: 'threads' })
  })

  it('attribution: a slug that is a prefix of another is replaced only where it matches whole', async () => {
    await plan('kreator')
    const { link: short } = await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/b1', showInBio: false, customSlug: 'promo' })
    const { link: long } = await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/b2', showInBio: false, customSlug: 'promo-2' })
    const { posts, postTargets, socialAccounts } = await import('../../server/core/db/schema')
    const [account] = await getDb().insert(socialAccounts).values({ workspaceId: ctx.workspaceId, platform: 'threads', externalId: 't2' }).returning()
    const [post] = await getDb().insert(posts).values({ workspaceId: ctx.workspaceId }).returning()
    const [target] = await getDb().insert(postTargets).values({ workspaceId: ctx.workspaceId, postId: post!.id, socialAccountId: account!.id, platform: 'threads', format: 'text' }).returning()
    const result = await attributeCaption(getDb(), target!, `${short.shortUrl} dan ${long.shortUrl}`)
    const [first, second] = result.split(' dan ')
    expect(first).not.toBe(short.shortUrl)
    expect(second).not.toBe(long.shortUrl)
    expect(second).not.toContain(`${first}-2`)
    expect(await getDb().select().from(shortLinks).where(eq(shortLinks.postTargetId, target!.id))).toHaveLength(2)
  })

  it('statistics clamp to the plan history instead of refusing', async () => {
    await plan('gratis')
    const stats = await workspaceAnalytics(ctx, { days: 90 })
    expect(stats.window).toMatchObject({ days: 30, requestedDays: 90, clamped: true })
    expect(stats.window.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('Etalase', () => {
  it('checks handles, adds existing products, publishes within the plan limit, and degrades branding', async () => {
    await plan('gratis')
    // Handlers validate with createBioSchema before calling core.
    expect(createBioSchema.safeParse({ handle: 'admin', title: 'X' }).success).toBe(false)
    expect(createBioSchema.safeParse({ handle: 'Ab', title: 'X' }).success).toBe(false)
    expect(createBioSchema.parse({ handle: '@Rina.Shop', title: 'X' }).handle).toBe('rina.shop')
    await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/p1', title: 'Serum', showInBio: false })
    const page = await createBio(ctx, { handle: 'rina.shop', title: 'Rina Shop' })
    expect(page.items).toHaveLength(1) // the existing product joined
    expect((await getPublicBio('rina.shop')).state).toBe('inactive') // not published yet
    await setBioPublished(ctx, true)
    const pub = await getPublicBio('RINA.SHOP')
    expect(pub.state).toBe('ok')
    if (pub.state === 'ok') {
      expect(pub.branding).toBe(true) // Gratis shows the footer
      expect(pub.items[0]!.url).toMatch(new RegExp(`^${shortUrl('').replace(/\/$/, '')}/`))
    }
    // A new product created with showInBio lands on the Etalase.
    await createLink(ctx, { destinationUrl: 'https://s.shopee.co.id/p2', title: 'Lipstik' })
    expect(await getDb().select().from(bioItems)).toHaveLength(2)
    await plan('kreator')
    const paid = await getPublicBio('rina.shop')
    expect(paid.state === 'ok' && paid.branding).toBe(false)
  })

  it('refuses a taken handle', async () => {
    await createBio(ctx, { handle: 'tokoku', title: 'A' })
    const base = testContext()
    const [other] = await getDb().insert(users).values({ name: 'B', email: 'b@x.id' }).returning({ id: users.id })
    const { workspaceId } = await provisionWorkspace(base, other!.id, { name: 'B', email: 'b@x.id' })
    await expect(createBio({ ...base, workspaceId, userId: other!.id, role: 'owner', impersonatorId: null }, { handle: 'TokoKu', title: 'B' })).rejects.toMatchObject({ statusCode: 409 })
  })
})
