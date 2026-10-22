import type { ChannelCapabilities } from './types'

const MB = 1024 * 1024

/** Instagram API with Instagram Login (docs/PLATFORM-CONSTRAINTS.md, verified 2026-10-22). */
export const instagram: ChannelCapabilities = {
  platform: 'instagram',
  formats: ['feed', 'carousel', 'reel', 'story'],
  maxChars: 2200,
  maxHashtags: 5,
  hashtagsIncludeFirstComment: true,
  maxMentions: 20,
  linkMode: 'plain',
  media: {
    feed: { kinds: ['image'], minItems: 1, maxItems: 1, image: { mimes: ['image/jpeg'], maxBytes: 8 * MB, aspect: [0.8, 1.91] } },
    carousel: {
      kinds: ['image', 'video'], minItems: 2, maxItems: 10,
      image: { mimes: ['image/jpeg'], maxBytes: 8 * MB, aspect: [0.8, 1.91] },
      video: { codecs: ['h264', 'hevc'], minSec: 3, maxSec: 60, maxBytes: 100 * MB, maxWidth: 1920 }
    },
    reel: { kinds: ['video'], minItems: 1, maxItems: 1, video: { codecs: ['h264', 'hevc'], minSec: 3, maxSec: 900, maxBytes: 300 * MB, maxWidth: 1920 } },
    story: {
      kinds: ['image', 'video'], minItems: 1, maxItems: 1,
      image: { mimes: ['image/jpeg'], maxBytes: 8 * MB },
      video: { codecs: ['h264', 'hevc'], minSec: 3, maxSec: 60, maxBytes: 100 * MB, maxWidth: 1920 }
    }
  },
  requiresPublicMediaUrl: true,
  asyncContainer: true,
  dailyPublishLimit: 50,
  supportsFirstComment: true,
  supportsCommentAutomation: true,
  available: true
}
