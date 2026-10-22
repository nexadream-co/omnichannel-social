import { z } from 'zod'

/**
 * The editor's recipe (ARCHITECTURE §8.5). An edit never overwrites media: it creates a new media_assets row with
 * `source_media_id` + `edit_spec`, so re-opening an edited item restores every step on the untouched source.
 * Images are rendered in the browser; videos by the media processor from the same spec. Pure (no Nitro imports):
 * the browser, the server and the media processor bundle this file.
 */

export const ASPECTS = ['original', 'free', '1:1', '4:5', '9:16', '1.91:1', '16:9'] as const
export type Aspect = (typeof ASPECTS)[number]

/** Width ÷ height for the fixed presets; `original` and `free` follow the crop box. */
export const ASPECT_RATIO: Record<Aspect, number | null> = {
  'original': null,
  'free': null,
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '1.91:1': 1.91,
  '16:9': 16 / 9
}

export const IMAGE_MAX_PX = 1440
export const VIDEO_MAX_SHORT_PX = 1080
export const MIN_VIDEO_EDIT_MS = 1000
export const MAX_LAYERS = 30
const MAX_LAYERS_JSON = 32 * 1024

const unit = z.number().min(0).max(1)

export const adjustSchema = z.object({
  brightness: z.number().min(0.5).max(1.5).default(1),
  contrast: z.number().min(0.5).max(1.5).default(1),
  saturation: z.number().min(0).max(2).default(1),
  sepia: z.number().min(0).max(1).default(0),
  grayscale: z.number().min(0).max(1).default(0),
  hue: z.number().min(-45).max(45).default(0)
})
export type Adjust = z.infer<typeof adjustSchema>
export const NEUTRAL_ADJUST: Adjust = { brightness: 1, contrast: 1, saturation: 1, sepia: 0, grayscale: 0, hue: 0 }

/** Positions are normalised to the output frame (0–1, centre of the layer); sizes to the output width. */
const placement = {
  id: z.string().min(1).max(40),
  x: unit,
  y: unit,
  scale: z.number().min(0.02).max(5).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  // Reserved for timed text (auto subtitles, post-v1); v1 layers show for the whole video.
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().min(0).optional()
}

export const TEXT_FONTS = ['jakarta', 'poppins', 'bebas', 'pacifico'] as const
export const TEXT_STYLES = ['plain', 'box', 'outline'] as const

export const layerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    ...placement,
    text: z.string().min(1).max(300),
    font: z.enum(TEXT_FONTS).default('jakarta'),
    style: z.enum(TEXT_STYLES).default('plain'),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ffffff'),
    size: z.number().min(0.01).max(0.5).default(0.06)
  }),
  z.object({
    type: z.literal('sticker'),
    ...placement,
    sticker: z.string().min(1).max(40),
    label: z.string().max(60).optional()
  }),
  z.object({
    type: z.literal('watermark'),
    ...placement,
    url: z.url().max(2048),
    opacity: z.number().min(0.1).max(1).default(0.8)
  })
])
export type Layer = z.infer<typeof layerSchema>

const cropSchema = z.object({ x: unit, y: unit, w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1) })
  .refine(c => c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, { error: 'Potongan keluar dari bingkai.' })
export type Crop = z.infer<typeof cropSchema>
export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

export const editSpecSchema = z.object({
  v: z.literal(1),
  kind: z.enum(['image', 'video']),
  /** Rotation and flips apply to the source first; `crop` is measured on the rotated frame. */
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  aspect: z.enum(ASPECTS).default('original'),
  crop: cropSchema.default(FULL_CROP),
  /** `crop` fills the frame with the crop box; `blur` fits it inside the aspect with a blurred copy behind. */
  fit: z.enum(['crop', 'blur']).default('crop'),
  preset: z.string().max(30).default('original'),
  adjust: adjustSchema.default(NEUTRAL_ADJUST),
  layers: z.array(layerSchema).max(MAX_LAYERS).default([]),
  trim: z.object({ startMs: z.number().int().min(0), endMs: z.number().int().min(1) })
    .refine(t => t.endMs - t.startMs >= MIN_VIDEO_EDIT_MS, { error: 'Video hasil potongan minimal 1 detik.' })
    .optional(),
  mute: z.boolean().default(false),
  coverMs: z.number().int().min(0).optional()
}).refine(s => JSON.stringify(s.layers).length <= MAX_LAYERS_JSON, { error: 'Terlalu banyak teks atau stiker.', path: ['layers'] })
  .refine(s => s.kind === 'video' || (!s.trim && !s.mute && s.coverMs === undefined), { error: 'Pengaturan video tidak berlaku untuk foto.' })
  .refine(s => s.fit === 'crop' || ASPECT_RATIO[s.aspect] !== null, { error: 'Pilih bentuk bingkai untuk latar blur.', path: ['fit'] })
export type EditSpec = z.infer<typeof editSpecSchema>

export const WATERMARK_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const

/** The workspace logo (Pengaturan → Tanda air); the editor places it as a `watermark` layer. */
export const watermarkSchema = z.object({
  url: z.url().max(2048),
  position: z.enum(WATERMARK_POSITIONS).default('bottom-right'),
  scale: z.number().min(0.05).max(0.5).default(0.18),
  opacity: z.number().min(0.1).max(1).default(0.8)
})
export type WorkspaceWatermark = z.infer<typeof watermarkSchema>

export function defaultSpec(kind: 'image' | 'video'): EditSpec {
  return { v: 1, kind, rotate: 0, flipH: false, flipV: false, aspect: 'original', crop: { ...FULL_CROP }, fit: 'crop', preset: 'original', adjust: { ...NEUTRAL_ADJUST }, layers: [], mute: false }
}

/** Source size after the spec's rotation. */
export function orientedSize(width: number, height: number, rotate: EditSpec['rotate']) {
  return rotate === 90 || rotate === 270 ? { width: height, height: width } : { width, height }
}

/** The crop box in pixels of the rotated source (integers; even for video so yuv420p stays valid). */
export function cropPixels(spec: Pick<EditSpec, 'rotate' | 'crop' | 'kind'>, width: number, height: number) {
  const { width: W, height: H } = orientedSize(width, height, spec.rotate)
  const step = spec.kind === 'video' ? 2 : 1
  const snap = (n: number) => Math.floor(n / step) * step
  const x = snap(Math.min(Math.round(spec.crop.x * W), W - step))
  const y = snap(Math.min(Math.round(spec.crop.y * H), H - step))
  const w = Math.max(step, snap(Math.min(Math.round(spec.crop.w * W), W - x)))
  const h = Math.max(step, snap(Math.min(Math.round(spec.crop.h * H), H - y)))
  return { x, y, w, h }
}

/**
 * The rendered frame size. Images: long side ≤ 1440 (the upload pipeline's size). Videos: short side ≤ 1080,
 * never upscaled past the crop box, both sides even.
 */
export function outputSize(spec: Pick<EditSpec, 'rotate' | 'crop' | 'kind' | 'aspect' | 'fit'>, width: number, height: number) {
  const box = cropPixels(spec, width, height)
  const fixed = ASPECT_RATIO[spec.aspect]
  const ratio = spec.fit === 'blur' && fixed ? fixed : box.w / box.h
  if (spec.kind === 'image') {
    const long = Math.min(IMAGE_MAX_PX, Math.max(box.w, box.h))
    return ratio >= 1
      ? { width: long, height: Math.max(1, Math.round(long / ratio)) }
      : { width: Math.max(1, Math.round(long * ratio)), height: long }
  }
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  const short = Math.min(VIDEO_MAX_SHORT_PX, Math.min(box.w, box.h))
  return ratio >= 1
    ? { width: even(short * ratio), height: even(short) }
    : { width: even(short), height: even(short / ratio) }
}

/** Duration of the edited video. */
export function editedDurationMs(spec: Pick<EditSpec, 'trim'>, sourceMs: number) {
  if (!spec.trim) return sourceMs
  return Math.max(0, Math.min(spec.trim.endMs, sourceMs) - spec.trim.startMs)
}

/** True when the spec changes nothing (the editor then closes without making a copy). */
export function isNoopSpec(spec: EditSpec, sourceMs?: number | null) {
  const fullCrop = spec.crop.x === 0 && spec.crop.y === 0 && spec.crop.w === 1 && spec.crop.h === 1
  const neutral = (Object.keys(NEUTRAL_ADJUST) as (keyof Adjust)[]).every(key => spec.adjust[key] === NEUTRAL_ADJUST[key])
  const fullTrim = !spec.trim || (spec.trim.startMs === 0 && (!sourceMs || spec.trim.endMs >= sourceMs))
  return spec.rotate === 0 && !spec.flipH && !spec.flipV && fullCrop && spec.fit === 'crop' && neutral && !spec.layers.length
    && fullTrim && !spec.mute && spec.coverMs === undefined
}
