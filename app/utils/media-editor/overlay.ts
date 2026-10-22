import Konva from 'konva'
import type { Crop, Layer } from '#shared/media/edit-spec'
import { stickerById, TEXT_FONT_META } from '#shared/media/presets'
import type { Size } from './layout'
import { loadImage } from './render'

export interface OverlayCallbacks {
  onLayerChange: (layer: Layer) => void
  onSelect: (id: string | null) => void
  onEditText: (id: string) => void
  onCropChange: (crop: Crop) => void
  stickerLabel: (stickerId: string) => string
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function isLight(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6
}

/**
 * The Konva stage over the preview: text, stickers and the logo (positions normalised to the frame, so the same
 * layers export at the output size), plus the crop box while cropping. The media itself is never drawn here.
 */
export class EditorOverlay {
  private stage: Konva.Stage
  private content = new Konva.Layer()
  private ui = new Konva.Layer()
  private transformer = new Konva.Transformer({
    keepRatio: true, enabledAnchors: CORNERS, rotationSnaps: [0, 90, 180, 270], anchorSize: 14, anchorCornerRadius: 7,
    anchorStroke: '#e6114f', borderStroke: '#ffffff', borderDash: [4, 4], padding: 6, flipEnabled: false, ignoreStroke: true
  })

  private cropTool: { rect: Konva.Rect, dim: Konva.Shape, transformer: Konva.Transformer } | null = null
  private images = new Map<string, HTMLImageElement | 'loading' | 'failed'>()
  private frame: Size = { width: 1, height: 1 }
  private layers: Layer[] = []
  private selectedId: string | null = null

  constructor(container: HTMLDivElement, private cb: OverlayCallbacks) {
    this.stage = new Konva.Stage({ container, width: 1, height: 1 })
    this.stage.add(this.content, this.ui)
    this.ui.add(this.transformer)
    this.stage.on('click tap', (event) => {
      if (event.target === this.stage) this.select(null)
    })
  }

  resize(frame: Size) {
    this.frame = frame
    this.stage.size(frame)
    this.render()
  }

  setLayers(layers: Layer[]) {
    this.layers = layers
    this.render()
  }

  select(id: string | null) {
    this.selectedId = id
    const node = id ? this.content.findOne(`#${id}`) : null
    this.transformer.nodes(node ? [node] : [])
    this.cb.onSelect(node ? id : null)
  }

  /** Redraws after web fonts arrive (text is measured with the font in use). */
  refresh() {
    this.render()
  }

  showCrop(crop: Crop, ratio: number | null) {
    this.hideCrop()
    this.content.visible(false)
    this.transformer.nodes([])
    const F = this.frame
    const rect = new Konva.Rect({ x: crop.x * F.width, y: crop.y * F.height, width: crop.w * F.width, height: crop.h * F.height, stroke: '#ffffff', strokeWidth: 2, draggable: true, fill: 'rgba(0,0,0,0)' })
    const box = () => ({ x: rect.x(), y: rect.y(), w: rect.width() * rect.scaleX(), h: rect.height() * rect.scaleY() })
    const dim = new Konva.Shape({
      listening: false,
      fill: 'rgba(0,0,0,0.55)',
      sceneFunc: (ctx, shape) => {
        const b = box()
        ctx.beginPath()
        ctx.rect(0, 0, F.width, b.y)
        ctx.rect(0, b.y + b.h, F.width, F.height - b.y - b.h)
        ctx.rect(0, b.y, b.x, b.h)
        ctx.rect(b.x + b.w, b.y, F.width - b.x - b.w, b.h)
        ctx.fillStrokeShape(shape)
      }
    })
    rect.dragBoundFunc((pos) => {
      const b = box()
      return { x: clamp(pos.x, 0, F.width - b.w), y: clamp(pos.y, 0, F.height - b.h) }
    })
    const transformer = new Konva.Transformer({
      nodes: [rect], keepRatio: ratio !== null, enabledAnchors: ratio !== null ? CORNERS : undefined, rotateEnabled: false, flipEnabled: false,
      ignoreStroke: true, anchorSize: 18, anchorCornerRadius: 9, anchorStroke: '#e6114f', borderStroke: '#ffffff',
      boundBoxFunc: (old, next) => (next.x < -0.5 || next.y < -0.5 || next.x + next.width > F.width + 0.5 || next.y + next.height > F.height + 0.5 || next.width < 32 || next.height < 32 ? old : next)
    })
    const emit = () => {
      const b = box()
      rect.setAttrs({ width: b.w, height: b.h, scaleX: 1, scaleY: 1 })
      const x = clamp(b.x / F.width, 0, 1)
      const y = clamp(b.y / F.height, 0, 1)
      this.cb.onCropChange({ x, y, w: clamp(b.w / F.width, 0.01, 1 - x), h: clamp(b.h / F.height, 0.01, 1 - y) })
    }
    rect.on('dragend transformend', emit)
    this.ui.add(dim, rect, transformer)
    this.cropTool = { rect, dim, transformer }
  }

  hideCrop() {
    if (this.cropTool) {
      this.cropTool.transformer.destroy()
      this.cropTool.rect.destroy()
      this.cropTool.dim.destroy()
      this.cropTool = null
    }
    this.content.visible(true)
  }

  /** The overlay at the output size (transparent where nothing is drawn); null when there are no layers. */
  exportCanvas(outputWidth: number): HTMLCanvasElement | null {
    if (!this.layers.length) return null
    return this.content.toCanvas({ pixelRatio: outputWidth / this.frame.width }) as HTMLCanvasElement
  }

  destroy() {
    this.stage.destroy()
  }

  private render() {
    this.content.destroyChildren()
    for (const layer of this.layers) {
      const node = this.build(layer)
      if (node) this.content.add(node)
    }
    const selected = this.selectedId ? this.content.findOne(`#${this.selectedId}`) : null
    this.transformer.nodes(selected ? [selected] : [])
    if (this.selectedId && !selected) this.select(null)
  }

  private build(layer: Layer): Konva.Group | null {
    const F = this.frame
    const body = layer.type === 'text' ? this.textBody(layer) : layer.type === 'sticker' ? this.stickerBody(layer) : this.watermarkBody(layer)
    if (!body) return null
    const group = new Konva.Group({ id: layer.id, x: layer.x * F.width, y: layer.y * F.height, rotation: layer.rotation, scaleX: layer.scale, scaleY: layer.scale, draggable: true })
    group.add(body.node)
    group.offset({ x: body.width / 2, y: body.height / 2 })
    if (layer.type === 'watermark') group.opacity(layer.opacity)
    group.dragBoundFunc(pos => ({ x: clamp(pos.x, 0, F.width), y: clamp(pos.y, 0, F.height) }))
    group.on('pointerdown', () => this.select(layer.id))
    group.on('dbltap dblclick', () => layer.type === 'text' && this.cb.onEditText(layer.id))
    group.on('dragend transformend', () => {
      this.cb.onLayerChange({
        ...layer,
        x: clamp(group.x() / F.width, 0, 1),
        y: clamp(group.y() / F.height, 0, 1),
        scale: clamp(group.scaleX(), 0.05, 5),
        rotation: clamp(Math.round(group.rotation() * 10) / 10, -360, 360)
      })
    })
    return group
  }

  private textBody(layer: Extract<Layer, { type: 'text' }>) {
    const F = this.frame
    const meta = TEXT_FONT_META[layer.font]
    const fontSize = layer.size * F.width
    const contrast = isLight(layer.color) ? '#111827' : '#ffffff'
    const text = new Konva.Text({
      text: layer.text, fontFamily: `"${meta.family}", sans-serif`, fontStyle: String(meta.weight), fontSize, lineHeight: 1.15, align: 'center',
      fill: layer.style === 'box' ? contrast : layer.color,
      ...(layer.style === 'outline' ? { stroke: contrast, strokeWidth: fontSize * 0.14, fillAfterStrokeEnabled: true, lineJoin: 'round' as const } : {}),
      ...(layer.style === 'plain' ? { shadowColor: '#000000', shadowBlur: fontSize * 0.25, shadowOpacity: 0.45 } : {})
    })
    if (text.width() > F.width * 0.9) text.width(F.width * 0.9)
    if (layer.style !== 'box') return { node: text, width: text.width(), height: text.height() }
    const label = new Konva.Label()
    label.add(new Konva.Tag({ fill: layer.color, cornerRadius: fontSize * 0.25 }))
    text.padding(fontSize * 0.3)
    label.add(text)
    return { node: label, width: label.width(), height: label.height() }
  }

  private stickerBody(layer: Extract<Layer, { type: 'sticker' }>) {
    const def = stickerById(layer.sticker)
    if (!def) return null
    const base = 0.055 * this.frame.width
    if (def.shape === 'emoji') {
      const emoji = new Konva.Text({ text: def.emoji, fontSize: base * 2.4 })
      return { node: emoji, width: emoji.width(), height: emoji.height() }
    }
    const text = new Konva.Text({
      text: layer.label ?? this.cb.stickerLabel(def.id), fontFamily: `"${TEXT_FONT_META.jakarta.family}", sans-serif`, fontStyle: '800',
      fontSize: base, fill: def.fg, align: 'center', lineHeight: 1.1
    })
    if (def.shape === 'burst') {
      const radius = Math.max(text.width(), text.height()) / 2 + base * 0.9
      const group = new Konva.Group()
      group.add(new Konva.Star({ x: radius, y: radius, numPoints: 14, innerRadius: radius * 0.84, outerRadius: radius, fill: def.bg, rotation: -8 }))
      text.setAttrs({ x: radius - text.width() / 2, y: radius - text.height() / 2, rotation: 0 })
      group.add(text)
      return { node: group, width: radius * 2, height: radius * 2 }
    }
    const label = new Konva.Label()
    label.add(new Konva.Tag({
      fill: def.bg, cornerRadius: def.shape === 'pill' ? base : base * 0.25,
      pointerDirection: def.shape === 'tag' ? 'left' : 'none', pointerWidth: base * 0.8, pointerHeight: base * 1.6,
      shadowColor: '#000000', shadowBlur: base * 0.3, shadowOpacity: 0.25,
      ...(def.bg === '#ffffff' ? { stroke: '#e5e7eb', strokeWidth: 1 } : {})
    }))
    text.padding(base * 0.55)
    label.add(text)
    // The price tag's point sticks out to the left of the label; shift it so the sticker starts at 0.
    const point = def.shape === 'tag' ? base * 0.8 : 0
    label.x(point)
    return { node: label, width: label.width() + point, height: label.height() }
  }

  private watermarkBody(layer: Extract<Layer, { type: 'watermark' }>) {
    const cached = this.images.get(layer.url)
    if (!cached) {
      this.images.set(layer.url, 'loading')
      loadImage(layer.url)
        .then(img => this.images.set(layer.url, img))
        .catch(() => this.images.set(layer.url, 'failed'))
        .finally(() => this.render())
    }
    if (!(cached instanceof HTMLImageElement)) return null
    const width = this.frame.width * 0.18
    const height = width * (cached.naturalHeight / Math.max(1, cached.naturalWidth))
    return { node: new Konva.Image({ image: cached, width, height }), width, height }
  }
}
