import type { Platform } from '../../../shared/channels/types'
import type { ChannelAdapter } from './adapter'
import { facebookAdapter } from './facebook'
import { fakeAdapter, isFakeMode } from './fake'
import { instagramAdapter } from './instagram'
import { threadsAdapter } from './threads'

const REAL: Partial<Record<Platform, ChannelAdapter>> = {
  instagram: instagramAdapter,
  threads: threadsAdapter,
  facebook: facebookAdapter
}

/** null = not available yet ("Segera hadir"). */
export function getAdapter(platform: Platform): ChannelAdapter | null {
  if (!REAL[platform]) return null
  return isFakeMode() ? fakeAdapter(platform) : REAL[platform]!
}
