import { describe, expect, it } from 'vitest'
import { decodeXml, parseRssItems, stripSourceSuffix } from '../../server/core/news/rss'

const FEED = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Top stories</title>
<item><title>Harbolnas 12.12 pecahkan rekor &amp; diskon 90% - Kompas.com</title><link>https://news.google.com/rss/articles/abc?oc=5</link>
<guid isPermaLink="false">CBMiabc</guid><pubDate>Sat, 21 Nov 2026 06:00:00 GMT</pubDate><description>&lt;a href="x"&gt;</description>
<source url="https://www.kompas.com">Kompas.com</source></item>
<item><title><![CDATA[Skincare lokal ramai diburu]]></title><link>https://news.google.com/rss/articles/def</link><source url="https://detik.com">detikNews</source></item>
<item><title>Tanpa link</title></item>
<item><title>Link http</title><link>http://insecure.example.com/a</link></item>
<item><title>Tanggal rusak - Antara</title><link>https://news.google.com/rss/articles/ghi</link><guid>g3</guid><pubDate>kemarin</pubDate><source url="https://antaranews.com">Antara</source></item>
</channel></rss>`

describe('news RSS reader', () => {
  it('reads title, link, guid, date and source in feed order', () => {
    const items = parseRssItems(FEED)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({
      externalId: 'CBMiabc', title: 'Harbolnas 12.12 pecahkan rekor & diskon 90%', source: 'Kompas.com',
      url: 'https://news.google.com/rss/articles/abc?oc=5', publishedAt: new Date('2026-11-21T06:00:00Z'), rank: 1
    })
    // No guid: the link is the id. CDATA titles work.
    expect(items[1]).toMatchObject({ externalId: 'https://news.google.com/rss/articles/def', title: 'Skincare lokal ramai diburu', source: 'detikNews', publishedAt: null, rank: 2 })
    // Items without an https link are skipped; ranks stay consecutive; a bad date becomes null.
    expect(items[2]).toMatchObject({ title: 'Tanggal rusak', rank: 3, publishedAt: null })
  })

  it('respects the limit', () => {
    expect(parseRssItems(FEED, 1)).toHaveLength(1)
  })

  it('decodes entities and strips the source tail only when it matches', () => {
    expect(decodeXml('A &amp; B &#8211; C &#x1F525; &lt;b&gt;')).toBe('A & B – C 🔥 <b>')
    expect(stripSourceSuffix('Judul - Kompas', 'Kompas')).toBe('Judul')
    expect(stripSourceSuffix('Judul - Kompas', 'Detik')).toBe('Judul - Kompas')
    expect(stripSourceSuffix(' - Kompas', 'Kompas')).toBe(' - Kompas')
    expect(stripSourceSuffix('Judul', null)).toBe('Judul')
  })
})
