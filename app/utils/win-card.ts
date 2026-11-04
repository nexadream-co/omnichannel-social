/**
 * A story-sized image (1080×1920) for a creator's win: "Etalase pertamaku sudah online!", "100 klik!". Drawn on a
 * canvas in the browser, then handed to the phone's share sheet (Instagram Story, WhatsApp) or downloaded.
 */
export interface WinCard {
  headline: string
  sub?: string
  /** A big number or word above the headline ("100", "1.000"). */
  stat?: string
  /** The creator's Etalase or short link, printed under the card. */
  url?: string | null
  footer: string
}

const W = 1080
const H = 1920
const INK = '#18181b'
const MUTED = '#52525b'
const BRAND = '#e6114f'
const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif'

/** Same picture for the same headline: the confetti is seeded, not random. */
function seeded(text: string) {
  let seed = 0
  for (const char of text) seed = (seed * 31 + char.charCodeAt(0)) >>> 0
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function renderWinCard(card: WinCard): Promise<Blob> {
  try {
    await Promise.all([document.fonts.load(`800 96px ${FONT}`), document.fonts.load(`500 44px ${FONT}`)])
  } catch {
    // the system font is fine
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#c20842')
  bg.addColorStop(0.4, '#e6114f')
  bg.addColorStop(0.75, '#f93466')
  bg.addColorStop(1, '#ff7a45')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Measure the card first, so the confetti can stay out of it.
  const inner = 780
  ctx.font = `800 88px ${FONT}`
  const headLines = wrap(ctx, card.headline, inner)
  ctx.font = `500 44px ${FONT}`
  const subLines = card.sub ? wrap(ctx, card.sub, inner) : []
  const statH = card.stat ? 250 : 0
  const cardH = 100 + statH + headLines.length * 100 + (subLines.length ? 36 + subLines.length * 60 : 0) + 100
  const cardY = Math.round((H - cardH) / 2)
  const cardX = 90

  const rand = seeded(card.headline)
  const colors = ['#ffffff', '#ffd166', '#ffe0e6', '#ffb4c4']
  for (let i = 0; i < 90; i++) {
    const x = rand() * W
    const y = rand() * H
    if (y > cardY - 30 && y < cardY + cardH + 30 && x > cardX - 30 && x < cardX + 930) continue
    const size = 10 + rand() * 18
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rand() * Math.PI)
    ctx.globalAlpha = 0.55 + rand() * 0.4
    ctx.fillStyle = colors[i % colors.length]!
    if (i % 3 === 0) {
      ctx.beginPath()
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillRect(-size / 2, -size / 5, size, size / 2.5)
    }
    ctx.restore()
  }

  ctx.save()
  ctx.shadowColor = 'rgba(77, 1, 27, 0.35)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.fillStyle = '#ffffff'
  roundedRect(ctx, cardX, cardY, W - cardX * 2, cardH, 56)
  ctx.fill()
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  let y = cardY + 100
  if (card.stat) {
    ctx.fillStyle = BRAND
    ctx.font = `800 220px ${FONT}`
    y += 190
    ctx.fillText(card.stat, W / 2, y)
    y += 60
  }
  ctx.fillStyle = INK
  ctx.font = `800 88px ${FONT}`
  for (const line of headLines) {
    y += 84
    ctx.fillText(line, W / 2, y)
    y += 16
  }
  if (subLines.length) {
    y += 36
    ctx.fillStyle = MUTED
    ctx.font = `500 44px ${FONT}`
    for (const line of subLines) {
      y += 46
      ctx.fillText(line, W / 2, y)
      y += 14
    }
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = `800 60px ${FONT}`
  ctx.fillText('Socialz.id', W / 2, 230)
  if (card.url) {
    ctx.font = `600 44px ${FONT}`
    ctx.fillText(card.url.replace(/^https?:\/\//, ''), W / 2, cardY + cardH + 120)
  }
  ctx.globalAlpha = 0.85
  ctx.font = `500 36px ${FONT}`
  ctx.fillText(card.footer, W / 2, H - 150)
  ctx.globalAlpha = 1

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('empty image')), 'image/png'))
}

/** Opens the share sheet with the image where the phone allows files, otherwise downloads it. */
export async function shareWinCard(card: WinCard, filename = 'socialz-momen'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderWinCard(card)
  const file = new File([blob], `${filename}.png`, { type: 'image/png' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: card.headline })
      return 'shared'
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return 'cancelled'
      // a refused share falls through to the download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
