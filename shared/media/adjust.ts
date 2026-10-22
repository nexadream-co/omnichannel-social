import type { Adjust } from './edit-spec'

/**
 * Colour adjustments as one ordered list of operations with the CSS Filter Effects maths (sRGB, clamped after
 * each step). The same list drives the live preview (`cssFilter`), the photo export (`applyToImageData`) and the
 * video render (`ffmpegColorFilters`), so what the creator sees is what gets posted.
 */
export type ColorOp
  = | { type: 'linear', slope: number, intercept: number } // per channel: v * slope + intercept (0–1)
    | { type: 'matrix', m: [number, number, number, number, number, number, number, number, number] }

type Matrix = Extract<ColorOp, { type: 'matrix' }>['m']

function saturateMatrix(s: number): Matrix {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s
  ]
}

function sepiaMatrix(amount: number): Matrix {
  const q = 1 - amount
  return [
    0.393 + 0.607 * q, 0.769 - 0.769 * q, 0.189 - 0.189 * q,
    0.349 - 0.349 * q, 0.686 + 0.314 * q, 0.168 - 0.168 * q,
    0.272 - 0.272 * q, 0.534 - 0.534 * q, 0.131 + 0.869 * q
  ]
}

function grayscaleMatrix(amount: number): Matrix {
  const q = 1 - amount
  return [
    0.2126 + 0.7874 * q, 0.7152 - 0.7152 * q, 0.0722 - 0.0722 * q,
    0.2126 - 0.2126 * q, 0.7152 + 0.2848 * q, 0.0722 - 0.0722 * q,
    0.2126 - 0.2126 * q, 0.7152 - 0.7152 * q, 0.0722 + 0.9278 * q
  ]
}

function hueMatrix(deg: number): Matrix {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072
  ]
}

/** Fixed order, identical everywhere: brightness → contrast → saturate → sepia → grayscale → hue. */
export function adjustOps(adjust: Adjust): ColorOp[] {
  const ops: ColorOp[] = []
  if (adjust.brightness !== 1) ops.push({ type: 'linear', slope: adjust.brightness, intercept: 0 })
  if (adjust.contrast !== 1) ops.push({ type: 'linear', slope: adjust.contrast, intercept: 0.5 - 0.5 * adjust.contrast })
  if (adjust.saturation !== 1) ops.push({ type: 'matrix', m: saturateMatrix(adjust.saturation) })
  if (adjust.sepia) ops.push({ type: 'matrix', m: sepiaMatrix(adjust.sepia) })
  if (adjust.grayscale) ops.push({ type: 'matrix', m: grayscaleMatrix(adjust.grayscale) })
  if (adjust.hue) ops.push({ type: 'matrix', m: hueMatrix(adjust.hue) })
  return ops
}

const fixed = (n: number) => Number(n.toFixed(4))

/** CSS `filter` value for the live preview (`none` when neutral). */
export function cssFilter(adjust: Adjust): string {
  const parts: string[] = []
  if (adjust.brightness !== 1) parts.push(`brightness(${fixed(adjust.brightness)})`)
  if (adjust.contrast !== 1) parts.push(`contrast(${fixed(adjust.contrast)})`)
  if (adjust.saturation !== 1) parts.push(`saturate(${fixed(adjust.saturation)})`)
  if (adjust.sepia) parts.push(`sepia(${fixed(adjust.sepia)})`)
  if (adjust.grayscale) parts.push(`grayscale(${fixed(adjust.grayscale)})`)
  if (adjust.hue) parts.push(`hue-rotate(${fixed(adjust.hue)}deg)`)
  return parts.join(' ') || 'none'
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** One sRGB pixel (0–255) through the ops. */
export function applyToPixel(ops: ColorOp[], r: number, g: number, b: number): [number, number, number] {
  let R = r / 255
  let G = g / 255
  let B = b / 255
  for (const op of ops) {
    if (op.type === 'linear') {
      R = clamp(R * op.slope + op.intercept)
      G = clamp(G * op.slope + op.intercept)
      B = clamp(B * op.slope + op.intercept)
    } else {
      const m = op.m
      const nr = clamp(m[0] * R + m[1] * G + m[2] * B)
      const ng = clamp(m[3] * R + m[4] * G + m[5] * B)
      const nb = clamp(m[6] * R + m[7] * G + m[8] * B)
      R = nr
      G = ng
      B = nb
    }
  }
  return [Math.round(R * 255), Math.round(G * 255), Math.round(B * 255)]
}

/** In place, RGBA. Canvas `ctx.filter` is missing on Safari, so the photo export does the maths itself. */
export function applyToImageData(data: Uint8ClampedArray, adjust: Adjust) {
  const ops = adjustOps(adjust)
  if (!ops.length) return
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = applyToPixel(ops, data[i]!, data[i + 1]!, data[i + 2]!)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

/** ffmpeg filters (RGB in between) for the same ops; empty when neutral. */
export function ffmpegColorFilters(adjust: Adjust): string[] {
  const ops = adjustOps(adjust)
  if (!ops.length) return []
  const filters = ['format=gbrp']
  for (const op of ops) {
    if (op.type === 'linear') {
      const expr = `clip(val*${fixed(op.slope)}+${fixed(op.intercept * 255)}\\,0\\,255)`
      filters.push(`lutrgb=r=${expr}:g=${expr}:b=${expr}`)
    } else {
      const [rr, rg, rb, gr, gg, gb, br, bg, bb] = op.m.map(fixed)
      filters.push(`colorchannelmixer=rr=${rr}:rg=${rg}:rb=${rb}:gr=${gr}:gg=${gg}:gb=${gb}:br=${br}:bg=${bg}:bb=${bb}`)
    }
  }
  return filters
}
