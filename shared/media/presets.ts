import { ASPECT_RATIO, NEUTRAL_ADJUST, type Adjust, type Aspect, type TEXT_FONTS } from './edit-spec'

/** One-tap looks. Each is plain adjustment data, so the sliders can fine-tune it afterwards. */
export const FILTER_PRESETS: { id: string, labelKey: string, adjust: Adjust }[] = [
  { id: 'original', labelKey: 'mediaEditor.preset.original', adjust: NEUTRAL_ADJUST },
  { id: 'bright', labelKey: 'mediaEditor.preset.bright', adjust: { ...NEUTRAL_ADJUST, brightness: 1.12, contrast: 1.05, saturation: 1.1 } },
  { id: 'vivid', labelKey: 'mediaEditor.preset.vivid', adjust: { ...NEUTRAL_ADJUST, contrast: 1.15, saturation: 1.35 } },
  { id: 'warm', labelKey: 'mediaEditor.preset.warm', adjust: { ...NEUTRAL_ADJUST, brightness: 1.04, saturation: 1.15, sepia: 0.2, hue: -5 } },
  { id: 'cool', labelKey: 'mediaEditor.preset.cool', adjust: { ...NEUTRAL_ADJUST, brightness: 1.03, contrast: 1.05, saturation: 0.95, hue: 10 } },
  { id: 'vintage', labelKey: 'mediaEditor.preset.vintage', adjust: { ...NEUTRAL_ADJUST, contrast: 0.9, saturation: 0.85, sepia: 0.35 } },
  { id: 'bw', labelKey: 'mediaEditor.preset.bw', adjust: { ...NEUTRAL_ADJUST, contrast: 1.1, grayscale: 1 } }
]

/** Crop shapes in the order the editor offers them, with the plain-language label. */
export const ASPECT_OPTIONS: { aspect: Aspect, labelKey: string }[] = [
  { aspect: 'original', labelKey: 'mediaEditor.aspect.original' },
  { aspect: '1:1', labelKey: 'mediaEditor.aspect.square' },
  { aspect: '4:5', labelKey: 'mediaEditor.aspect.portrait' },
  { aspect: '9:16', labelKey: 'mediaEditor.aspect.story' },
  { aspect: '1.91:1', labelKey: 'mediaEditor.aspect.landscape' },
  { aspect: '16:9', labelKey: 'mediaEditor.aspect.wide' },
  { aspect: 'free', labelKey: 'mediaEditor.aspect.free' }
]

export type StickerShape = 'pill' | 'tag' | 'burst' | 'emoji'

export interface StickerDef {
  id: string
  shape: StickerShape
  /** Default text (i18n key); emoji stickers carry the emoji itself. */
  labelKey?: string
  emoji?: string
  bg: string
  fg: string
  /** The creator can change the text (price, discount…). */
  editable: boolean
}

export const STICKERS: StickerDef[] = [
  { id: 'price', shape: 'tag', labelKey: 'mediaEditor.sticker.price', bg: '#e11d48', fg: '#ffffff', editable: true },
  { id: 'discount', shape: 'burst', labelKey: 'mediaEditor.sticker.discount', bg: '#f59e0b', fg: '#111827', editable: true },
  { id: 'promo', shape: 'pill', labelKey: 'mediaEditor.sticker.promo', bg: '#dc2626', fg: '#ffffff', editable: true },
  { id: 'freeShipping', shape: 'pill', labelKey: 'mediaEditor.sticker.freeShipping', bg: '#16a34a', fg: '#ffffff', editable: true },
  { id: 'linkInBio', shape: 'pill', labelKey: 'mediaEditor.sticker.linkInBio', bg: '#ffffff', fg: '#111827', editable: true },
  { id: 'checkout', shape: 'pill', labelKey: 'mediaEditor.sticker.checkout', bg: '#ea580c', fg: '#ffffff', editable: true },
  { id: 'limited', shape: 'pill', labelKey: 'mediaEditor.sticker.limited', bg: '#111827', fg: '#ffffff', editable: true },
  { id: 'new', shape: 'burst', labelKey: 'mediaEditor.sticker.new', bg: '#2563eb', fg: '#ffffff', editable: true },
  ...['🔥', '⭐', '👉', '❤️', '✅', '💯', '🛒', '🎁'].map((emoji, index) => ({ id: `emoji${index + 1}`, shape: 'emoji' as const, emoji, bg: 'transparent', fg: '#000000', editable: false }))
]

export const stickerById = (id: string) => STICKERS.find(s => s.id === id)

/** Text fonts the editor offers (self-hosted by @nuxt/fonts through app/assets/css/main.css). */
export const TEXT_FONT_META: Record<(typeof TEXT_FONTS)[number], { family: string, weight: number, labelKey: string }> = {
  jakarta: { family: 'Plus Jakarta Sans', weight: 800, labelKey: 'mediaEditor.font.jakarta' },
  poppins: { family: 'Poppins', weight: 600, labelKey: 'mediaEditor.font.poppins' },
  bebas: { family: 'Bebas Neue', weight: 400, labelKey: 'mediaEditor.font.bebas' },
  pacifico: { family: 'Pacifico', weight: 400, labelKey: 'mediaEditor.font.pacifico' }
}

export const TEXT_COLORS = ['#ffffff', '#111827', '#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#a855f7', '#ec4899']

/**
 * The fixed crop shape closest to the photo that a platform accepts without cropping it itself:
 * e.g. a tall photo for an Instagram feed (0.8–1.91) → 4:5.
 */
export function suggestAspect(ratio: number, bounds?: [min: number, max: number]): Aspect {
  const target = bounds ? Math.min(Math.max(ratio, bounds[0]), bounds[1]) : ratio
  const fixed = ASPECT_OPTIONS.map(o => ({ aspect: o.aspect, ratio: ASPECT_RATIO[o.aspect] }))
    .filter((o): o is { aspect: Aspect, ratio: number } => o.ratio !== null && (!bounds || (o.ratio >= bounds[0] - 0.001 && o.ratio <= bounds[1] + 0.001)))
  return fixed.reduce((best, o) => Math.abs(Math.log(o.ratio / target)) < Math.abs(Math.log(best.ratio / target)) ? o : best, fixed[0]!).aspect
}
