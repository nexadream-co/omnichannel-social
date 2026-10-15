import type { ChannelCapabilities } from './types'

const MB = 1024 * 1024

export const threads: ChannelCapabilities = {
  platform: 'threads',
  formats: ['text', 'feed', 'carousel'],
  maxChars: 500,
  maxHashtags: 1,
  maxLinks: 5,
  linkMode: 'attachment',
  media: {
    text: { kinds: [], minItems: 0, maxItems: 0 },
    feed: {
      kinds: ['image', 'video'], minItems: 1, maxItems: 1,
      image: { mimes: ['image/jpeg', 'image/png'], maxBytes: 8 * MB },
      video: { codecs: ['h264', 'hevc'], minSec: 1, maxSec: 300, maxBytes: 1024 * MB, maxWidth: 1920 }
    },
    carousel: {
      kinds: ['image', 'video'], minItems: 2, maxItems: 20,
      image: { mimes: ['image/jpeg', 'image/png'], maxBytes: 8 * MB },
      video: { codecs: ['h264', 'hevc'], minSec: 1, maxSec: 300, maxBytes: 1024 * MB, maxWidth: 1920 }
    }
  },
  requiresPublicMediaUrl: true,
  asyncContainer: true,
  dailyPublishLimit: 250,
  supportsFirstComment: true,
  supportsCommentAutomation: false,
  available: true
}
