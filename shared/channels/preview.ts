import type { ChannelCapabilities } from './types'

/** What a feed shows of a caption before "… lainnya" (the cutoff lives in each channel's capabilities). */
export function previewCaption(caps: Pick<ChannelCapabilities, 'previewCaptionCutoff'>, caption: string): { text: string, truncated: boolean } {
  const cutoff = caps.previewCaptionCutoff
  if (!cutoff) return { text: caption, truncated: false }
  const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(caption)].map(s => s.segment)
    : [...caption]
  if (graphemes.length <= cutoff) return { text: caption, truncated: false }
  return { text: graphemes.slice(0, cutoff).join('').trimEnd(), truncated: true }
}
