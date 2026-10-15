import type { MediaKind, Platform, PostFormat } from './types'

/**
 * Smart default (docs/SCREENS.md principle 4): the creator never has to pick a format.
 * "Opsi lanjutan" can override it (e.g. Instagram Story).
 */
export function defaultFormat(platform: Platform, media: { kind: MediaKind }[]): PostFormat {
  const videos = media.filter(m => m.kind === 'video').length
  if (!media.length) return platform === 'instagram' ? 'feed' : 'text'
  if (media.length > 1) return 'carousel'
  if (videos === 1) return platform === 'threads' ? 'feed' : 'reel'
  return 'feed'
}

export const FORMAT_LABEL_KEYS: Record<PostFormat, string> = {
  feed: 'format.feed',
  carousel: 'format.carousel',
  reel: 'format.reel',
  story: 'format.story',
  text: 'format.text'
}
