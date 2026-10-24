import type { ChannelCapabilities } from './types'

const MB = 1024 * 1024

export const facebook: ChannelCapabilities = {
  platform: 'facebook',
  formats: ['text', 'feed', 'carousel', 'reel'],
  maxChars: 63206,
  previewCaptionCutoff: 480,
  linkMode: 'clickable',
  media: {
    text: { kinds: [], minItems: 0, maxItems: 0 },
    feed: { kinds: ['image'], minItems: 1, maxItems: 1, image: { mimes: ['image/jpeg', 'image/png'], maxBytes: 10 * MB } },
    carousel: { kinds: ['image'], minItems: 2, maxItems: 10, image: { mimes: ['image/jpeg', 'image/png'], maxBytes: 10 * MB } },
    reel: { kinds: ['video'], minItems: 1, maxItems: 1, video: { codecs: ['h264'], minSec: 3, maxSec: 90, maxBytes: 1024 * MB, maxWidth: 1920 } }
  },
  requiresPublicMediaUrl: true,
  asyncContainer: false,
  supportsFirstComment: true,
  supportsCommentAutomation: false,
  available: true
}
