export type Platform = 'instagram' | 'threads' | 'facebook' | 'tiktok' | 'youtube' | 'x'
export type PostFormat = 'feed' | 'carousel' | 'reel' | 'story' | 'text'
export type MediaKind = 'image' | 'video'

export interface MediaRules {
  kinds: MediaKind[]
  minItems: number
  maxItems: number
  image?: { mimes: string[], maxBytes: number, aspect?: [min: number, max: number] }
  video?: { codecs: string[], minSec: number, maxSec: number, maxBytes: number, maxWidth: number }
}

export interface ChannelCapabilities {
  platform: Platform
  formats: PostFormat[]
  maxChars: number
  previewCaptionCutoff?: number // characters shown before "… lainnya" in the feed; absent = shown in full
  maxHashtags?: number
  hashtagsIncludeFirstComment?: boolean // Instagram counts tags in comments toward the same limit
  maxMentions?: number
  maxLinks?: number
  linkMode: 'clickable' | 'plain' | 'attachment'
  media: Partial<Record<PostFormat, MediaRules>>
  requiresPublicMediaUrl: boolean
  asyncContainer: boolean
  dailyPublishLimit?: number
  supportsFirstComment: boolean
  supportsCommentAutomation: boolean
  available: boolean // false = "Segera hadir"
}

export interface Issue {
  level: 'error' | 'warning'
  code: string // i18n key, e.g. 'channel.instagram.linkNotClickable'
  field?: string
  params?: Record<string, unknown>
}

export interface TargetDraft {
  format: PostFormat
  caption: string
  firstComment?: string
}

export interface MediaMeta {
  kind: MediaKind
  mime: string
  bytes: number
  width?: number | null
  height?: number | null
  durationMs?: number | null
  codec?: string | null
}
