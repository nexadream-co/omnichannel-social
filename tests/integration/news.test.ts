import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { WorkspaceContext } from '../../server/core/context'
import { closeDb, getDb } from '../../server/core/db/client'
import { newsItems } from '../../server/core/db/schema'
import { syncContent } from '../../server/core/content-sync'
import { listNews, newsRefreshJob, storeHeadlines } from '../../server/core/news/service'
import { setNewsSource } from '../../server/core/services/news'
import { fakeNewsSource } from '../../server/core/services/news/fake'
import type { NewsHeadline } from '../../server/core/services/news/types'
import { invalidateSettingsCache, setSetting } from '../../server/core/settings'
import { testContext, truncate } from './helpers'

const HOUR = 3_600_000
const ws = (): WorkspaceContext => ({ ...testContext(), workspaceId: 'ws-news', userId: null, role: 'owner', impersonatorId: null })
const headline = (id: string, rank: number, title = `Berita ${id}`): NewsHeadline => ({ externalId: id, title, source: 'Kompas', url: `https://news.example.com/${id}`, publishedAt: null, rank })
const job = { id: 'j', queue: 'news.refresh', payload: {}, workspaceId: null, attempts: 1, maxAttempts: 1, runAt: new Date() }

beforeEach(async () => {
  await truncate('news_items', 'app_settings')
  invalidateSettingsCache()
  setNewsSource(undefined)
})
afterAll(async () => {
  setNewsSource(undefined)
  await closeDb()
})

describe('Lagi rame', () => {
  it('counts each hour a story stays in the top list, not doubled ticks', async () => {
    const ctx = testContext()
    const t0 = new Date(Date.now() - 5 * HOUR)
    await storeHeadlines(ctx, 'id', [headline('a', 1), headline('b', 2)], t0)
    await storeHeadlines(ctx, 'id', [headline('a', 3), headline('b', 1)], new Date(t0.getTime() + 60_000)) // doubled tick
    await storeHeadlines(ctx, 'id', [headline('a', 2, 'Berita a (diperbarui)')], new Date(t0.getTime() + HOUR))
    const rows = await getDb().select().from(newsItems).orderBy(newsItems.externalId)
    expect(rows.map(r => [r.externalId, r.seenCount, r.lastRank, r.bestRank])).toEqual([['a', 2, 2, 1], ['b', 1, 1, 1]])
    expect(rows[0]!.title).toBe('Berita a (diperbarui)')
    expect(rows[0]!.firstSeenAt.getTime()).toBe(t0.getTime())
  })

  it('today: still-current stories first by rank; week: by hours in the top list', async () => {
    const ctx = testContext()
    const now = new Date()
    // "old" was big three days ago (5 hours on top); "gone" fell out of today's list; "x"/"y" are on top now.
    for (let h = 0; h < 5; h++) await storeHeadlines(ctx, 'id', [headline('old', 1)], new Date(now.getTime() - 72 * HOUR + h * HOUR))
    await storeHeadlines(ctx, 'id', [headline('gone', 1)], new Date(now.getTime() - 6 * HOUR))
    await storeHeadlines(ctx, 'id', [headline('y', 2), headline('x', 1)], new Date(now.getTime() - 30 * 60_000))
    await storeHeadlines(ctx, 'world', [headline('w', 1)], now)
    const today = await listNews(ws(), { region: 'id', range: 'today' }, now)
    expect(today.items.map(i => i.title)).toEqual(['Berita x', 'Berita y', 'Berita gone'])
    expect(today.items.map(i => i.hot)).toEqual([true, true, false])
    const week = await listNews(ws(), { region: 'id', range: 'week' }, now)
    expect(week.items[0]!.title).toBe('Berita old')
    expect(week.items).toHaveLength(4)
    expect((await listNews(ws(), { region: 'world', range: 'today' }, now)).items.map(i => i.title)).toEqual(['Berita w'])
  })

  it('the job reads both regions, survives one failing, and purges old stories', async () => {
    const ctx = testContext()
    await getDb().insert(newsItems).values({ region: 'id', externalId: 'ancient', title: 'Lama', url: 'https://x.test/a', lastRank: 1, bestRank: 1, firstSeenAt: new Date(Date.now() - 20 * 86_400_000), lastSeenAt: new Date(Date.now() - 15 * 86_400_000) })
    const healthy = fakeNewsSource()
    setNewsSource({ name: 'flaky', topHeadlines: async region => region === 'world' ? Promise.reject(new Error('timeout')) : healthy.topHeadlines(region) })
    await newsRefreshJob(job, ctx)
    const rows = await getDb().select().from(newsItems)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.region === 'id')).toBe(true)
    expect(rows.some(r => r.externalId === 'ancient')).toBe(false)
  })

  it('the back-office switch hides the card and stops reading', async () => {
    const ctx = testContext()
    await setSetting('app.news.enabled', 'false', getDb())
    invalidateSettingsCache()
    let reads = 0
    setNewsSource({ name: 'count', topHeadlines: async () => (reads++, []) })
    await newsRefreshJob(job, ctx)
    expect(reads).toBe(0)
    expect(await listNews(ws(), { region: 'id', range: 'today' })).toEqual({ enabled: false, items: [] })
    expect(await getDb().select().from(newsItems).where(eq(newsItems.region, 'id'))).toHaveLength(0)
  })

  it('the content sync reads the news now and reports each region (templates skipped here)', async () => {
    setNewsSource(fakeNewsSource())
    const result = await syncContent(testContext(), { templates: false })
    expect(result.templates).toBeNull()
    expect(result.news!.id).toBeGreaterThan(0)
    expect(result.news!.world).toBeGreaterThan(0)
    expect((await listNews(ws(), { region: 'id', range: 'today' })).items.length).toBeGreaterThan(0)
  })
})
