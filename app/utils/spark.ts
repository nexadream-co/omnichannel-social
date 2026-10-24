export type SparkTarget = HTMLElement | MouseEvent | { x: number, y: number }

const COLORS = ['#e6114f', '#f93466', '#ffd166']

function originOf(target: SparkTarget): { x: number, y: number } {
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  if ('clientX' in target) return { x: target.clientX, y: target.clientY }
  return target
}

/**
 * A tiny burst of dots around a point (web animations, no library). Under reduced motion it only pulses a ring
 * on the element instead of moving anything.
 */
export function sparkAt(target: SparkTarget): void {
  if (!import.meta.client) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const el = target instanceof HTMLElement ? target : target instanceof MouseEvent ? target.currentTarget as HTMLElement | null : null
    if (el) {
      el.classList.add('animate-ring-pulse')
      setTimeout(() => el.classList.remove('animate-ring-pulse'), 500)
    }
    return
  }
  const { x, y } = originOf(target)
  const layer = document.createElement('div')
  layer.className = 'spark-layer'
  const total = 9
  let pending = total
  for (let i = 0; i < total; i++) {
    const size = 6 + Math.round(Math.random() * 2)
    const dot = document.createElement('span')
    dot.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:${i % 3 === 0 ? '2px' : '9999px'};background:${COLORS[i % COLORS.length]}`
    layer.appendChild(dot)
    const angle = (Math.PI * 2 * i) / total + Math.random() * 0.4
    const distance = 24 + Math.random() * 32
    const animation = dot.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.4)`, opacity: 0 }
    ], { duration: 500, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' })
    animation.onfinish = () => {
      if (--pending === 0) layer.remove()
    }
  }
  document.body.appendChild(layer)
}
