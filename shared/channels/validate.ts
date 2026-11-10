import { countTags } from '../hashtags/parse'
import type { ChannelCapabilities, Issue, MediaKind, MediaMeta, TargetDraft } from './types'

const URL_PATTERN = /https?:\/\/\S+/gi
const MENTION_PATTERN = /(^|\s)@[\w.]+/g

/** Counts characters the way the platforms do: user-perceived characters (emoji count as one). */
export function countChars(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(text)].length
  }
  return [...text].length
}

/**
 * Pure: the composer and the server validate a post with the same rules (ARCHITECTURE §6.1).
 * Issue codes are i18n keys. Warnings never block; errors block scheduling.
 */
export function validateTarget(caps: ChannelCapabilities, draft: TargetDraft, media: MediaMeta[]): Issue[] {
  const p = caps.platform
  const issues: Issue[] = []
  if (!caps.available) return [{ level: 'error', code: `channel.${p}.unavailable` }]
  if (!caps.formats.includes(draft.format)) return [{ level: 'error', code: 'channel.formatUnsupported', field: 'format', params: { platform: p, format: draft.format } }]

  const chars = countChars(draft.caption)
  if (chars > caps.maxChars) issues.push({ level: 'error', code: 'channel.captionTooLong', field: 'caption', params: { platform: p, max: caps.maxChars, count: chars } })
  const hashtags = countTags(draft.caption) + (caps.hashtagsIncludeFirstComment && draft.firstComment ? countTags(draft.firstComment) : 0)
  if (caps.maxHashtags !== undefined && hashtags > caps.maxHashtags) issues.push({ level: 'error', code: 'channel.tooManyHashtags', field: 'caption', params: { platform: p, max: caps.maxHashtags, count: hashtags } })
  const mentions = draft.caption.match(MENTION_PATTERN)?.length ?? 0
  if (caps.maxMentions !== undefined && mentions > caps.maxMentions) issues.push({ level: 'error', code: 'channel.tooManyMentions', field: 'caption', params: { platform: p, max: caps.maxMentions, count: mentions } })
  const links = new Set(draft.caption.match(URL_PATTERN) ?? [])
  if (caps.maxLinks !== undefined && links.size > caps.maxLinks) issues.push({ level: 'error', code: 'channel.tooManyLinks', field: 'caption', params: { platform: p, max: caps.maxLinks, count: links.size } })
  if (links.size && caps.linkMode === 'plain') issues.push({ level: 'warning', code: `channel.${p}.linkNotClickable`, field: 'caption' })

  const rules = caps.media[draft.format]
  if (!rules) return issues
  // Every media rule depends on the platform and the format, so the message names both
  // ("Tambahkan minimal 2 foto atau video untuk Carousel Instagram"); `media` is what the format accepts.
  const scope = { platform: p, format: draft.format, media: mediaWord(rules.kinds) }
  if (media.length < rules.minItems) issues.push({ level: 'error', code: 'channel.mediaRequired', field: 'media', params: { ...scope, min: rules.minItems } })
  if (media.length > rules.maxItems) issues.push({ level: 'error', code: 'channel.tooManyMedia', field: 'media', params: { ...scope, max: rules.maxItems } })
  if (rules.minItems === 0 && !media.length && !draft.caption.trim()) issues.push({ level: 'error', code: 'channel.emptyPost', field: 'caption', params: scope })

  media.forEach((item, index) => {
    if (!rules.kinds.includes(item.kind)) {
      issues.push({ level: 'error', code: 'channel.mediaKindUnsupported', field: `media.${index}`, params: { ...scope, kind: item.kind } })
      return
    }
    if (item.kind === 'image' && rules.image) {
      // Wrong type or size is fixed by the media pipeline (JPEG conversion, compression), so only warn.
      if (!rules.image.mimes.includes(item.mime)) issues.push({ level: 'warning', code: 'channel.imageWillBeConverted', field: `media.${index}`, params: scope })
      if (rules.image.aspect && item.width && item.height) {
        const ratio = item.width / item.height
        if (ratio < rules.image.aspect[0] || ratio > rules.image.aspect[1]) issues.push({ level: 'warning', code: 'channel.imageWillBeCropped', field: `media.${index}`, params: scope })
      }
    }
    if (item.kind === 'video' && rules.video && item.durationMs != null) {
      const seconds = item.durationMs / 1000
      if (seconds < rules.video.minSec) issues.push({ level: 'error', code: 'channel.videoTooShort', field: `media.${index}`, params: { ...scope, min: rules.video.minSec } })
      if (seconds > rules.video.maxSec) issues.push({ level: 'error', code: 'channel.videoTooLong', field: `media.${index}`, params: { ...scope, max: rules.video.maxSec } })
    }
  })
  return issues
}

/** Which media a format takes, as the `channel.media.*` label key the message shows. */
function mediaWord(kinds: MediaKind[]): 'any' | MediaKind {
  return kinds.length === 1 ? kinds[0]! : 'any'
}

export function hasBlockingIssues(issues: Issue[]): boolean {
  return issues.some(issue => issue.level === 'error')
}
