import { safeFetch } from '../../net/safe-fetch'
import { parseRssItems } from '../../news/rss'
import type { NewsRegion, NewsSource } from './types'

/** Google News "Top stories" RSS, in Bahasa: Indonesia, and the World section of the Indonesian edition. */
const FEEDS: Record<NewsRegion, string> = {
  id: 'https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id',
  world: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=id&gl=ID&ceid=ID:id'
}

export function googleNewsSource(): NewsSource {
  return {
    name: 'google-news',
    async topHeadlines(region) {
      const response = await safeFetch(FEEDS[region], { maxBytes: 1024 * 1024, timeoutMs: 10_000, accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' })
      return parseRssItems(new TextDecoder().decode(response.body))
    }
  }
}
