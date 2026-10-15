/**
 * Pure ffmpeg/ffprobe helpers shared by the app and the media processor container (docs/blueprint/19 §5).
 * No imports: the processor bundles this file on its own.
 */
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

export interface ProcessRequest {
  assetId: string
  ref: string
  kind: 'image' | 'video'
  sourceUrl: string
  callbackUrl: string
  outputs: { variant: string, putUrl: string, contentType: string }[]
}

export interface ProcessResult {
  assetId: string
  ref: string
  status: 'done' | 'failed'
  probe?: ProbeResult
  outputs?: { variant: string, bytes: number, width: number | null, height: number | null, durationMs: number | null, codec: string | null }[]
  error?: { code: 'unreadable' | 'too_long' | 'unsupported' | 'failed', message: string }
}
