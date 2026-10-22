import { ASPECT_RATIO, cropPixels, orientedSize, outputSize, type Crop, type EditSpec } from '#shared/media/edit-spec'

/**
 * Editor geometry shared by the live preview (CSS on <img>/<video>) and the photo export (canvas), so both place
 * the source the same way ffmpeg does for videos (server/core/media/ffmpeg-args.ts editVideoArgs).
 */
export interface Size { width: number, height: number }
export interface Rect { x: number, y: number, width: number, height: number }

export function fitInside(content: Size, area: Size): Size {
  const scale = Math.min(area.width / content.width, area.height / content.height)
  return { width: content.width * scale, height: content.height * scale }
}

/** The largest centred crop with `ratio` (width ÷ height) on the rotated source, normalised. */
export function centeredCrop(ratio: number | null, source: Size, rotate: EditSpec['rotate']): Crop {
  if (!ratio) return { x: 0, y: 0, w: 1, h: 1 }
  const { width, height } = orientedSize(source.width, source.height, rotate)
  const w = Math.min(width, height * ratio)
  const h = w / ratio
  return { x: (width - w) / 2 / width, y: (height - h) / 2 / height, w: w / width, h: h / height }
}

/** The crop box's ratio lock while cropping: fixed shapes and `original` keep their ratio, `free` and blur fits don't. */
export function cropLock(spec: Pick<EditSpec, 'aspect' | 'fit' | 'rotate'>, source: Size): number | null {
  if (spec.fit === 'blur' || spec.aspect === 'free') return null
  if (spec.aspect === 'original') {
    const oriented = orientedSize(source.width, source.height, spec.rotate)
    return oriented.width / oriented.height
  }
  return ASPECT_RATIO[spec.aspect]
}

/** Where the crop box lands inside a frame of the output's shape: the whole frame, or centred over the blur. */
export function contentRect(spec: EditSpec, source: Size, frame: Size): Rect {
  if (spec.fit === 'crop') return { x: 0, y: 0, ...frame }
  const box = cropPixels(spec, source.width, source.height)
  const inner = fitInside({ width: box.w, height: box.h }, frame)
  return { x: (frame.width - inner.width) / 2, y: (frame.height - inner.height) / 2, ...inner }
}

/** The blurred background: the crop box scaled to cover the whole frame. */
export function coverRect(spec: EditSpec, source: Size, frame: Size): Rect {
  const box = cropPixels(spec, source.width, source.height)
  const scale = Math.max(frame.width / box.w, frame.height / box.h)
  return { x: (frame.width - box.w * scale) / 2, y: (frame.height - box.h * scale) / 2, width: box.w * scale, height: box.h * scale }
}

/**
 * Placement of the unrotated source so that the crop box (in rotated-source pixels) fills `target`:
 * the source's size on screen and its centre, before rotation and flips.
 */
export function placeSource(spec: EditSpec, source: Size, target: Rect, wholeFrame = false) {
  const oriented = orientedSize(source.width, source.height, spec.rotate)
  const box = wholeFrame ? { x: 0, y: 0, w: oriented.width, h: oriented.height } : cropPixels(spec, source.width, source.height)
  const scale = target.width / box.w
  return {
    width: source.width * scale,
    height: source.height * scale,
    centerX: target.x - box.x * scale + (oriented.width * scale) / 2,
    centerY: target.y - box.y * scale + (oriented.height * scale) / 2
  }
}

/** CSS that puts an <img>/<video> (absolutely positioned at 0,0) where placeSource says. */
export function sourceStyle(spec: EditSpec, placed: ReturnType<typeof placeSource>, filter: string) {
  return {
    width: `${placed.width}px`,
    height: `${placed.height}px`,
    transform: `translate(${placed.centerX - placed.width / 2}px, ${placed.centerY - placed.height / 2}px) scale(${spec.flipH ? -1 : 1}, ${spec.flipV ? -1 : 1}) rotate(${spec.rotate}deg)`,
    transformOrigin: 'center',
    filter
  }
}

/** The preview frame: the output's shape while composing, the whole rotated source while cropping. */
export function previewFrame(spec: EditSpec, source: Size, area: Size, cropping: boolean): Size {
  if (cropping) return fitInside(orientedSize(source.width, source.height, spec.rotate), area)
  return fitInside(outputSize(spec, source.width, source.height), area)
}
