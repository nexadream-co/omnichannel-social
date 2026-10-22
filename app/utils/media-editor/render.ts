import { applyToImageData } from '#shared/media/adjust'
import { outputSize, type EditSpec } from '#shared/media/edit-spec'
import { contentRect, coverRect, placeSource, type Rect, type Size } from './layout'

/**
 * Loads a stored image for drawing on a canvas. The media domain must answer CORS for the app origin (deploy
 * steps, docs/HANDOFF.md); the query keeps the browser from reusing a cached non-CORS response.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = url.startsWith('blob:') || url.startsWith('data:') ? url : `${url}${url.includes('?') ? '&' : '?'}cors=1`
  })
}

/** Draws the source into `target` with the spec's rotation and flips (the canvas twin of sourceStyle). */
function drawSource(ctx: CanvasRenderingContext2D, img: CanvasImageSource, spec: EditSpec, source: Size, target: Rect) {
  const placed = placeSource(spec, source, target)
  ctx.save()
  ctx.beginPath()
  ctx.rect(target.x, target.y, target.width, target.height)
  ctx.clip()
  ctx.translate(placed.centerX, placed.centerY)
  ctx.scale(spec.flipH ? -1 : 1, spec.flipV ? -1 : 1)
  ctx.rotate((spec.rotate * Math.PI) / 180)
  ctx.drawImage(img, -placed.width / 2, -placed.height / 2, placed.width, placed.height)
  ctx.restore()
}

/** Cheap blur that works everywhere (Safari has no ctx.filter): shrink, then scale back up smoothly. */
function drawBlurred(ctx: CanvasRenderingContext2D, img: CanvasImageSource, spec: EditSpec, source: Size, frame: Size) {
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(frame.width / 24))
  small.height = Math.max(1, Math.round(frame.height / 24))
  const smallCtx = small.getContext('2d')!
  const cover = coverRect(spec, source, frame)
  const k = small.width / frame.width
  smallCtx.imageSmoothingQuality = 'high'
  drawSource(smallCtx, img, spec, source, { x: cover.x * k, y: cover.y * k, width: cover.width * k, height: cover.height * k })
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, frame.width, frame.height)
  ctx.restore()
}

/** The finished photo: geometry → colour → overlay (text, stickers, logo), as a JPEG ≤ 1440 px. */
export async function renderImage(img: HTMLImageElement, spec: EditSpec, overlay: HTMLCanvasElement | null): Promise<Blob> {
  const source = { width: img.naturalWidth, height: img.naturalHeight }
  const out = outputSize(spec, source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = out.width
  canvas.height = out.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, out.width, out.height)
  if (spec.fit === 'blur') drawBlurred(ctx, img, spec, source, out)
  ctx.imageSmoothingQuality = 'high'
  drawSource(ctx, img, spec, source, contentRect(spec, source, out))
  const pixels = ctx.getImageData(0, 0, out.width, out.height)
  applyToImageData(pixels.data, spec.adjust)
  ctx.putImageData(pixels, 0, 0)
  if (overlay) ctx.drawImage(overlay, 0, 0, out.width, out.height)
  return canvasBlob(canvas, 'image/jpeg', 0.9)
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('export'))), type, quality))
}
