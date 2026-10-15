import { env } from '../../env'
import { fakeMediaProcessor } from './fake'
import { httpMediaProcessor } from './http'
import type { MediaProcessor } from './types'

export type { MediaProcessor } from './types'

const key = Symbol.for('socialz.media-processor')
type G = typeof globalThis & { [key]?: MediaProcessor }

export function mediaProcessor(): MediaProcessor {
  const g = globalThis as G
  if (!g[key]) {
    const config = env()
    g[key] = config.MEDIA_PROCESSOR_DRIVER === 'fake' ? fakeMediaProcessor() : httpMediaProcessor(config.MEDIA_PROCESSOR_URL, config.MEDIA_PROCESSOR_SECRET)
  }
  return g[key]!
}

/** Tests only. */
export function setMediaProcessor(processor: MediaProcessor | undefined) {
  (globalThis as G)[key] = processor
}
