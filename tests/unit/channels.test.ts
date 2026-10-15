import { describe, expect, it } from 'vitest'
import { CHANNELS } from '../../shared/channels/registry'
import { countChars, hasBlockingIssues, validateTarget } from '../../shared/channels/validate'
import { classifyGraphError, GraphError } from '../../server/core/channels/graph-client'
import { parseProbe } from '../../server/core/media/ffmpeg-args'
import { imageDimensions } from '../../server/core/media/image-header'

const jpeg = (mime = 'image/jpeg') => ({ kind: 'image' as const, mime, bytes: 1000, width: 1080, height: 1350 })

describe('validateTarget', () => {
  it('counts emoji as one character', () => {
    expect(countChars('👍🏽 hai')).toBe(5)
  })
  it('blocks a too-long Threads caption and warns on Instagram links', () => {
    expect(hasBlockingIssues(validateTarget(CHANNELS.threads, { format: 'text', caption: 'x'.repeat(501) }, []))).toBe(true)
    const ig = validateTarget(CHANNELS.instagram, { format: 'feed', caption: 'Beli di https://shope.ee/abc' }, [jpeg()])
    expect(ig.map(i => i.code)).toEqual(['channel.instagram.linkNotClickable'])
    expect(hasBlockingIssues(ig)).toBe(false)
  })
  it('requires media and respects carousel bounds, but only warns on fixable images', () => {
    expect(validateTarget(CHANNELS.instagram, { format: 'feed', caption: 'x' }, []).map(i => i.code)).toContain('channel.mediaRequired')
    expect(validateTarget(CHANNELS.instagram, { format: 'carousel', caption: '' }, Array.from({ length: 11 }, () => jpeg())).map(i => i.code)).toContain('channel.tooManyMedia')
    const png = validateTarget(CHANNELS.instagram, { format: 'feed', caption: '' }, [jpeg('image/png')])
    expect(png.map(i => i.level)).toEqual(['warning'])
  })
  it('limits Threads to 5 unique links and rejects unsupported formats', () => {
    const caption = [1, 2, 3, 4, 5, 6].map(n => `https://a.id/${n}`).join(' ')
    expect(validateTarget(CHANNELS.threads, { format: 'text', caption }, []).map(i => i.code)).toContain('channel.tooManyLinks')
    expect(validateTarget(CHANNELS.facebook, { format: 'story', caption: 'x' }, [])[0]!.code).toBe('channel.formatUnsupported')
  })
})

describe('Graph error classification', () => {
  const graph = (code: number | null, subcode: number | null = null, status = 400) => new GraphError(status, code, subcode, 'm', 'trace', false)
  it('maps Meta codes to adapter kinds', () => {
    expect(classifyGraphError(graph(190)).kind).toBe('auth')
    expect(classifyGraphError(graph(4)).kind).toBe('rate_limit')
    expect(classifyGraphError(graph(9, 2207042)).kind).toBe('quota')
    expect(classifyGraphError(graph(9007)).kind).toBe('transient')
    expect(classifyGraphError(graph(1, null, 500)).kind).toBe('transient')
    expect(classifyGraphError(graph(100, 2207026)).kind).toBe('validation')
    expect(classifyGraphError(graph(368)).kind).toBe('permanent')
    expect(classifyGraphError(graph(200)).kind).toBe('auth')
    expect(classifyGraphError(graph(190)).fbtraceId).toBe('trace')
  })
})

describe('media helpers', () => {
  it('reads dimensions from PNG and JPEG headers', () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    new DataView(png.buffer).setUint32(16, 1080)
    new DataView(png.buffer).setUint32(20, 1350)
    expect(imageDimensions(png)).toEqual({ width: 1080, height: 1350 })
    const jpeg = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0, 0, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0, 0, 0, 0, 0, 0])
    expect(imageDimensions(jpeg)).toEqual({ width: 1080, height: 1350 })
  })
  it('swaps width and height for rotated phone video', () => {
    const json = JSON.stringify({ streams: [{ codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }, { codec_type: 'audio' }], format: { duration: '4.0', format_name: 'mov,mp4' } })
    expect(parseProbe(json)).toMatchObject({ kind: 'video', width: 1080, height: 1920, durationMs: 4000, hasAudio: true, rotation: 90 })
  })
})
