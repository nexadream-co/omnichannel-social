import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../../server/core/db/client'
import { contactMessages, faqs, pages, plans } from '../../server/core/db/schema'
import { landingPayload, sitemapPages, submitContact } from '../../server/core/public-site'
import { invalidateSettingsCache, setSetting } from '../../server/core/settings'
import { SEED_PLANS } from '../../shared/utils/plans'
import { testContext, truncate } from './helpers'

const ctx = () => ({ ...testContext(), ip: '203.0.113.9' })
const message = { name: 'Budi', email: 'Budi@Example.com', message: 'Halo, saya mau tanya paket tahunan.' }

beforeAll(async () => {
  for (const p of SEED_PLANS) await getDb().insert(plans).values({ id: `plan-${p.slug}`, ...p }).onConflictDoNothing()
})
beforeEach(async () => {
  await truncate('contact_messages', 'faqs', 'pages', 'rate_limit_buckets', 'notifications', 'app_settings')
  invalidateSettingsCache()
})
afterAll(closeDb)

describe('public site', () => {
  it('landing reads plans, active FAQ and company settings from the DB', async () => {
    await getDb().insert(faqs).values([{ question: 'Gratis?', answer: 'Ya.', order: 1 }, { question: 'Disembunyikan', answer: 'x', isActive: false }])
    const payload = await landingPayload(getDb())
    expect(payload.plans.map(p => p.slug)).toEqual(SEED_PLANS.filter(p => p.isActive && p.isPublic).map(p => p.slug))
    expect(payload.faqs.map(f => f.question)).toEqual(['Gratis?'])
    expect(payload.registrationOpen).toBe(true)
    await setSetting('app.registrationOpen', 'false')
    expect((await landingPayload(getDb())).registrationOpen).toBe(false)
  })

  it('contact: stored lowercased, bots dropped silently, and rate-limited per IP', async () => {
    expect(await submitContact(ctx(), { ...message, website: 'http://spam' })).toEqual({ ok: true })
    expect(await getDb().select().from(contactMessages)).toHaveLength(0)
    await setSetting('app.contactRateLimitPerHour', '2')
    await submitContact(ctx(), message)
    await submitContact(ctx(), { ...message, phone: '0812-3456-7890' })
    await expect(submitContact(ctx(), message)).rejects.toMatchObject({ statusCode: 429 })
    const rows = await getDb().select().from(contactMessages)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ email: 'budi@example.com', status: 'new', ip: '203.0.113.9' })
    expect(rows.find(r => r.phone)!.phone).toBe('6281234567890')
  })

  it('sitemap lists published pages with privacy/terms at their short routes', async () => {
    await getDb().insert(pages).values([
      { slug: 'privacy', title: 'P', content: 'x' }, { slug: 'bantuan', title: 'B', content: 'x' }, { slug: 'draft', title: 'D', content: 'x', isPublished: false }
    ])
    expect((await sitemapPages(getDb())).map(p => p.path).sort()).toEqual(['/page/bantuan', '/privacy'])
  })
})
