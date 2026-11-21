import type { NewsHeadline } from '../services/news/types'

/**
 * A small RSS 2.0 reader for headline feeds: `<item>` title, link, guid, pubDate and `<source>`. Pure (tests, any
 * runtime); no XML library, since the feeds are flat and only these fields are read.
 */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

export function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : ''
      }
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function tag(item: string, name: string): string | null {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(item)
  return match ? decodeXml(match[1]!) : null
}

/** "Judul berita - detikNews" → "Judul berita" when the tail is the source's name (headline feeds append it). */
export function stripSourceSuffix(title: string, source: string | null): string {
  if (!source) return title
  const suffix = ` - ${source}`
  return title.endsWith(suffix) && title.length > suffix.length ? title.slice(0, -suffix.length).trim() : title
}

export function parseRssItems(xml: string, limit = 30): NewsHeadline[] {
  const items: NewsHeadline[] = []
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const item = match[1]!
    const rawTitle = tag(item, 'title')
    const url = tag(item, 'link')
    if (!rawTitle || !url || !/^https:\/\//i.test(url)) continue
    const source = tag(item, 'source')
    const date = tag(item, 'pubDate')
    const published = date ? new Date(date) : null
    items.push({
      externalId: (tag(item, 'guid') || url).slice(0, 500),
      title: stripSourceSuffix(rawTitle, source).slice(0, 300),
      source: source?.slice(0, 120) || null,
      url: url.slice(0, 2000),
      publishedAt: published && Number.isFinite(published.getTime()) ? published : null,
      rank: items.length + 1
    })
    if (items.length >= limit) break
  }
  return items
}
