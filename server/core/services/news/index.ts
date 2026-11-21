import { env } from '../../env'
import { fakeNewsSource } from './fake'
import { googleNewsSource } from './google-news'
import type { NewsSource } from './types'

export type { NewsHeadline, NewsRegion, NewsSource } from './types'

const key = Symbol.for('socialz.news')
type G = typeof globalThis & { [key]?: NewsSource }

export function newsSource(): NewsSource {
  const g = globalThis as G
  g[key] ??= env().ADAPTER_MODE === 'fake' ? fakeNewsSource() : googleNewsSource()
  return g[key]!
}

/** Tests only. */
export function setNewsSource(source: NewsSource | undefined) {
  (globalThis as G)[key] = source
}
