/**
 * Spring motion for the Ide board: the floating drag card lands in its slot (FLIP with the Web Animations API).
 * The easing is a damped spring sampled into a CSS `linear()` curve, so it overshoots slightly and settles.
 */

/** Where the floating card was let go: its box on screen, the point it hung from, and its tilt and scale. */
export interface DragFlight {
  left: number
  top: number
  width: number
  height: number
  /** The grab point inside the card (the rotation origin). */
  ox: number
  oy: number
  tilt: number
  scale: number
}

/** Gap between cards in a board column, in px (the sibling shift and the slot use it). */
export const BOARD_GAP = 8

let flight: DragFlight | null = null
export function setDragFlight(value: DragFlight | null) {
  flight = value
}
/** Read once by the drop handler, while `planner.drag` still holds what was dropped. */
export function takeDragFlight(): DragFlight | null {
  const value = flight
  flight = null
  return value
}

function springCurve(damping = 0.55, omega = 17, steps = 28, seconds = 0.45): string {
  const wd = omega * Math.sqrt(1 - damping * damping)
  const points: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * seconds
    const value = 1 - Math.exp(-damping * omega * t) * (Math.cos(wd * t) + (damping * omega / wd) * Math.sin(wd * t))
    points.push(i === steps ? '1' : value.toFixed(4))
  }
  return `linear(${points.join(', ')})`
}
const SPRING = springCurve()

export function prefersReducedMotion(): boolean {
  return import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Carries `el` from where the floating card was let go into its own box. Reduced motion: a short fade. */
export function flipFrom(el: HTMLElement, from: DragFlight): Animation | null {
  const to = el.getBoundingClientRect()
  if (!to.width || !to.height || typeof el.animate !== 'function') return null
  if (prefersReducedMotion()) return el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' })
  const dx = from.left - to.left
  const dy = from.top - to.top
  const transformOrigin = `${from.ox}px ${from.oy}px`
  return el.animate([
    { transformOrigin, transform: `translate(${dx}px, ${dy}px) rotate(${from.tilt}deg) scale(${from.scale})`, boxShadow: '0 22px 36px -10px rgba(0, 0, 0, 0.38)', zIndex: 30 },
    { transformOrigin, transform: 'translate(0px, 0px) rotate(0deg) scale(1)', boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)', zIndex: 30 }
  ], { duration: 450, easing: SPRING })
}
