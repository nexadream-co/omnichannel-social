import { describe, expect, it } from 'vitest'
import { adjustOps, applyToPixel, cssFilter, ffmpegColorFilters } from '../../shared/media/adjust'
import { cropPixels, defaultSpec, editSpecSchema, isNoopSpec, outputSize, type EditSpec } from '../../shared/media/edit-spec'
import { FILTER_PRESETS } from '../../shared/media/presets'
import { instagramAdapter } from '../../server/core/channels/instagram'
import { editVideoArgs, posterArgs } from '../../server/core/media/ffmpeg-args'

const video = (patch: Partial<EditSpec> = {}): EditSpec => ({ ...defaultSpec('video'), ...patch })
const image = (patch: Partial<EditSpec> = {}): EditSpec => ({ ...defaultSpec('image'), ...patch })

describe('edit spec', () => {
  it('fills defaults and rejects what cannot be rendered', () => {
    expect(editSpecSchema.parse({ v: 1, kind: 'image' })).toEqual(defaultSpec('image'))
    expect(editSpecSchema.safeParse({ v: 1, kind: 'image', mute: true }).success).toBe(false)
    expect(editSpecSchema.safeParse({ v: 1, kind: 'video', fit: 'blur', aspect: 'original' }).success).toBe(false)
    expect(editSpecSchema.safeParse({ v: 1, kind: 'image', crop: { x: 0.5, y: 0, w: 0.6, h: 1 } }).success).toBe(false)
    expect(editSpecSchema.safeParse({ v: 1, kind: 'video', trim: { startMs: 1000, endMs: 1500 } }).success).toBe(false)
    expect(editSpecSchema.safeParse({ v: 1, kind: 'image', layers: [{ type: 'text', id: 't1', x: 0.5, y: 0.5, text: 'Promo!' }] }).success).toBe(true)
  })
  it('knows when nothing changed', () => {
    expect(isNoopSpec(defaultSpec('video'), 5000)).toBe(true)
    expect(isNoopSpec(video({ trim: { startMs: 0, endMs: 5000 } }), 5000)).toBe(true)
    expect(isNoopSpec(video({ trim: { startMs: 0, endMs: 4000 } }), 5000)).toBe(false)
    expect(isNoopSpec(image({ rotate: 90 }))).toBe(false)
  })
})

describe('geometry', () => {
  it('measures the crop on the rotated frame, with even sides for video', () => {
    expect(cropPixels(video({ rotate: 90, crop: { x: 0.1, y: 0.2, w: 0.8, h: 0.5 } }), 1281, 721)).toEqual({ x: 72, y: 256, w: 576, h: 640 })
    expect(cropPixels(image({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 } }), 1001, 500)).toEqual({ x: 250, y: 0, w: 501, h: 500 })
  })
  it('sizes photos to a 1440 long side and videos to a 1080 short side, never upscaling video', () => {
    expect(outputSize(image({ aspect: '4:5', crop: { x: 0.2, y: 0, w: 0.6, h: 1 } }), 4000, 3000)).toEqual({ width: 1152, height: 1440 })
    expect(outputSize(image(), 800, 600)).toEqual({ width: 800, height: 600 })
    expect(outputSize(video({ aspect: '9:16', fit: 'blur' }), 1920, 1080)).toEqual({ width: 1080, height: 1920 })
    expect(outputSize(video({ aspect: '9:16', fit: 'blur' }), 1280, 720)).toEqual({ width: 720, height: 1280 })
    const odd = outputSize(video({ crop: { x: 0, y: 0, w: 0.77, h: 0.61 } }), 1080, 1920)
    expect(odd.width % 2 + odd.height % 2).toBe(0)
  })
})

describe('colour adjustments', () => {
  it('is neutral by default everywhere', () => {
    expect(cssFilter(defaultSpec('image').adjust)).toBe('none')
    expect(ffmpegColorFilters(defaultSpec('image').adjust)).toEqual([])
  })
  it('follows the CSS filter maths', () => {
    const neutral = defaultSpec('image').adjust
    // saturate(0) = luminance grey; brightness and contrast are linear and clamp.
    const [r, g, b] = applyToPixel(adjustOps({ ...neutral, saturation: 0 }), 200, 100, 50)
    expect(r).toBe(g)
    expect(g).toBe(b)
    expect(r).toBe(Math.round(255 * (0.213 * 200 / 255 + 0.715 * 100 / 255 + 0.072 * 50 / 255)))
    expect(applyToPixel(adjustOps({ ...neutral, brightness: 1.5 }), 200, 100, 0)).toEqual([255, 150, 0])
    expect(applyToPixel(adjustOps({ ...neutral, contrast: 1.5 }), 128, 0, 255)).toEqual([128, 0, 255])
  })
  it('gives ffmpeg the same operations in the same order', () => {
    const warm = FILTER_PRESETS.find(p => p.id === 'warm')!.adjust
    expect(cssFilter(warm)).toBe('brightness(1.04) saturate(1.15) sepia(0.2) hue-rotate(-5deg)')
    const filters = ffmpegColorFilters(warm)
    expect(filters[0]).toBe('format=gbrp')
    expect(filters).toHaveLength(1 + adjustOps(warm).length)
    expect(filters[1]).toBe('lutrgb=r=clip(val*1.04+0\\,0\\,255):g=clip(val*1.04+0\\,0\\,255):b=clip(val*1.04+0\\,0\\,255)')
    const saturate = adjustOps(warm)[1] as { m: number[] }
    expect(filters[2]).toBe(`colorchannelmixer=rr=${Number(saturate.m[0]!.toFixed(4))}:rg=${Number(saturate.m[1]!.toFixed(4))}:rb=${Number(saturate.m[2]!.toFixed(4))}:gr=${Number(saturate.m[3]!.toFixed(4))}:gg=${Number(saturate.m[4]!.toFixed(4))}:gb=${Number(saturate.m[5]!.toFixed(4))}:br=${Number(saturate.m[6]!.toFixed(4))}:bg=${Number(saturate.m[7]!.toFixed(4))}:bb=${Number(saturate.m[8]!.toFixed(4))}`)
  })
})

describe('ffmpeg edit arguments', () => {
  const probe = { width: 1920, height: 1080, durationMs: 10_000, hasAudio: true }
  it('trims, fits on a blurred background, overlays the PNG and drops audio when muted', () => {
    const args = editVideoArgs(video({ aspect: '9:16', fit: 'blur', trim: { startMs: 1500, endMs: 4000 }, mute: true }), probe, 'in.mp4', 'ov.png', 'out.mp4')
    expect(args.slice(0, 7)).toEqual(['-y', '-ss', '1.500', '-i', 'in.mp4', '-i', 'ov.png'])
    expect(args).toContain('-an')
    expect(args[args.indexOf('-t') + 1]).toBe('2.500')
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph).toContain('crop=1920:1080:0:0')
    expect(graph).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40')
    expect(graph).toContain('[base][1:v]overlay=0:0:format=auto,format=yuv420p[v]')
  })
  it('rotates, flips, crops and keeps audio', () => {
    const args = editVideoArgs(video({ rotate: 90, flipH: true, aspect: '1:1', crop: { x: 0, y: 0.2, w: 1, h: 0.5625 } }), probe, 'in.mp4', null, 'out.mp4')
    expect(args).not.toContain('-ss')
    expect(args).toEqual(expect.arrayContaining(['-map', '0:a:0']))
    expect(args[args.indexOf('-filter_complex') + 1]).toBe('[0:v]transpose=clock,hflip,crop=1080:1080:0:384,scale=1080:1080,setsar=1,fps=fps=\'min(60,source_fps)\'[base];[base]format=yuv420p[v]')
  })
  it('takes the poster inside the video', () => {
    expect(posterArgs('v.mp4', 9000, 3000, 'p.jpg').slice(0, 3)).toEqual(['-y', '-ss', '2.900'])
  })
})

describe('Instagram cover frame', () => {
  it('sends the picked frame as thumb_offset for Reels', async () => {
    const bodies: string[] = []
    const fetchStub = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      return new Response(JSON.stringify({ id: 'c1' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const account = { externalId: 'ig-1', accessToken: 'tok' } as never
    await instagramAdapter.prepare({ account, fetch: fetchStub, log: console as never }, { format: 'reel', caption: 'x', media: [{ url: 'https://m/v.mp4', kind: 'video', coverMs: 2500 }], options: {} })
    expect(bodies[0]).toContain('thumb_offset=2500')
  })
})
