/**
 * Pure ffmpeg/ffprobe helpers shared by the app and the media processor container (docs/blueprint/19 §5).
 * Imports only the pure editor helpers in shared/media: the processor bundles these files on their own.
 */
import { ffmpegColorFilters } from '../../../shared/media/adjust'
import { cropPixels, editedDurationMs, outputSize, type EditSpec } from '../../../shared/media/edit-spec'

export interface ProbeResult {
  kind: 'image' | 'video'
  width: number | null
  height: number | null
  durationMs: number | null
  codec: string | null
  hasAudio: boolean
  rotation: number
}

export const MAX_VIDEO_MS = 20 * 60_000

export const ffprobeArgs = (input: string) => ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input]

interface FfprobeJson {
  streams?: { codec_type?: string, codec_name?: string, width?: number, height?: number, tags?: { rotate?: string }, side_data_list?: { rotation?: number }[], nb_frames?: string }[]
  format?: { duration?: string, format_name?: string }
}

export function parseProbe(json: string): ProbeResult {
  const data = JSON.parse(json) as FfprobeJson
  const video = data.streams?.find(s => s.codec_type === 'video')
  const audio = data.streams?.find(s => s.codec_type === 'audio')
  const formatName = data.format?.format_name ?? ''
  const imageCodec = ['mjpeg', 'png', 'webp', 'hevc_image', 'gif'].includes(video?.codec_name ?? '')
  const stillImage = /image2|png_pipe|jpeg_pipe|webp_pipe|heif|gif/.test(formatName) || (imageCodec && !audio && Number(data.format?.duration ?? 0) < 0.5)
  const rotation = Math.abs(Number(video?.tags?.rotate ?? video?.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? 0)) % 360
  const swap = rotation === 90 || rotation === 270
  const width = video?.width ?? null
  const height = video?.height ?? null
  return {
    kind: stillImage ? 'image' : 'video',
    width: swap ? height : width,
    height: swap ? width : height,
    durationMs: data.format?.duration ? Math.round(Number(data.format.duration) * 1000) : null,
    codec: video?.codec_name ?? null,
    hasAudio: Boolean(audio),
    rotation
  }
}

/** Any image (HEIC, WebP, PNG…) → JPEG, long side ≤ 1440 px, metadata (EXIF/GPS) stripped. */
export function imageToJpegArgs(input: string, output: string): string[] {
  return ['-y', '-i', input, '-map_metadata', '-1', '-vf', 'scale=\'min(1440,iw)\':\'min(1440,ih)\':force_original_aspect_ratio=decrease', '-frames:v', '1', '-q:v', '3', output]
}

/**
 * Any phone video → H.264/AAC MP4 with the short side ≤ 1080 px, ≤ 60 fps, faststart, no metadata.
 * ffmpeg applies the rotation tag automatically, so iPhone portrait videos come out upright.
 */
export function videoToMp4Args(input: string, output: string, hasAudio: boolean): string[] {
  return [
    '-y', '-i', input, '-map_metadata', '-1',
    '-vf', 'scale=\'trunc(min(1,1080/min(iw,ih))*iw/2)*2\':\'trunc(min(1,1080/min(iw,ih))*ih/2)*2\',fps=fps=\'min(60,source_fps)\'',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']),
    '-movflags', '+faststart', output
  ]
}

const seconds = (ms: number) => (ms / 1000).toFixed(3)

/**
 * The editor's video render (ARCHITECTURE §8.5): trim → rotate/flip → crop, or fit inside the frame over a blurred
 * copy → colour → the browser-drawn overlay PNG (text, stickers, watermark) → the same H.264/AAC encode as uploads.
 * `probe` describes the source, which is always an upright processed MP4.
 */
export function editVideoArgs(spec: EditSpec, probe: Pick<ProbeResult, 'width' | 'height' | 'durationMs' | 'hasAudio'>, input: string, overlay: string | null, output: string): string[] {
  const width = probe.width ?? 0
  const height = probe.height ?? 0
  const box = cropPixels(spec, width, height)
  const out = outputSize(spec, width, height)
  const orient: string[] = []
  if (spec.rotate === 90) orient.push('transpose=clock')
  if (spec.rotate === 270) orient.push('transpose=cclock')
  if (spec.rotate === 180) orient.push('hflip', 'vflip')
  if (spec.flipH) orient.push('hflip')
  if (spec.flipV) orient.push('vflip')
  orient.push(`crop=${box.w}:${box.h}:${box.x}:${box.y}`)
  const finish = ['setsar=1', ...ffmpegColorFilters(spec.adjust), 'fps=fps=\'min(60,source_fps)\'']
  const graph = spec.fit === 'blur'
    ? [
        `[0:v]${orient.join(',')},split[fgsrc][bgsrc]`,
        `[bgsrc]scale=${out.width}:${out.height}:force_original_aspect_ratio=increase,crop=${out.width}:${out.height},gblur=sigma=40[bg]`,
        `[fgsrc]scale=${out.width}:${out.height}:force_original_aspect_ratio=decrease[fg]`,
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,${finish.join(',')}[base]`
      ]
    : [`[0:v]${orient.join(',')},scale=${out.width}:${out.height},${finish.join(',')}[base]`]
  graph.push(overlay ? '[base][1:v]overlay=0:0:format=auto,format=yuv420p[v]' : '[base]format=yuv420p[v]')
  const trimmed = spec.trim && probe.durationMs ? editedDurationMs(spec, probe.durationMs) : null
  const audio = probe.hasAudio && !spec.mute
  return [
    '-y',
    ...(spec.trim ? ['-ss', seconds(spec.trim.startMs)] : []),
    '-i', input,
    ...(overlay ? ['-i', overlay] : []),
    ...(trimmed ? ['-t', seconds(trimmed)] : []),
    '-map_metadata', '-1',
    '-filter_complex', graph.join(';'),
    '-map', '[v]',
    ...(audio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-movflags', '+faststart', output
  ]
}

/** A JPEG still (≤ 720 px wide) for grids and the Reels cover. `atMs` is clamped inside the video. */
export function posterArgs(input: string, atMs: number, durationMs: number | null, output: string): string[] {
  const at = Math.max(0, Math.min(atMs, (durationMs ?? atMs + 1) - 100))
  return ['-y', '-ss', seconds(at), '-i', input, '-frames:v', '1', '-vf', 'scale=\'min(720,iw)\':-2', '-q:v', '3', output]
}

/** The editor's part of a processor request: the spec plus a presigned GET for the overlay PNG, if any. */
export interface VideoEditRequest {
  spec: EditSpec
  overlayUrl: string | null
}

export interface ProcessRequest {
  assetId: string
  ref: string
  kind: 'image' | 'video'
  sourceUrl: string
  callbackUrl: string
  /** `main` is always first; edited videos also ask for a `poster` JPEG. */
  outputs: { variant: string, putUrl: string, contentType: string }[]
  edit?: VideoEditRequest
}

export interface ProcessResult {
  assetId: string
  ref: string
  status: 'done' | 'failed'
  probe?: ProbeResult
  outputs?: { variant: string, bytes: number, width: number | null, height: number | null, durationMs: number | null, codec: string | null }[]
  error?: { code: 'unreadable' | 'too_long' | 'unsupported' | 'failed', message: string }
}
