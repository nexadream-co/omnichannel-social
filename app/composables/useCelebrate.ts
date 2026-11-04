import { usePreferredReducedMotion } from '@vueuse/core'
import { haptic } from '~/utils/haptics'
import { sparkAt, type SparkTarget } from '~/utils/spark'

const COLORS = ['#e6114f', '#f93466', '#ffd166']

/** Small celebrations: confetti for big moments, a spark for small ones. Both stay still under reduced motion. */
export function useCelebrate() {
  const preference = usePreferredReducedMotion()
  const reduced = computed(() => preference.value === 'reduce')

  async function confetti(opts: { origin?: HTMLElement | { x: number, y: number }, big?: boolean, angle?: number, spread?: number, particleCount?: number, haptics?: boolean } = {}): Promise<void> {
    if (!import.meta.client) return
    if (opts.haptics !== false) haptic('success')
    if (reduced.value) return
    const { default: fire } = await import('canvas-confetti')
    let origin = { x: 0.5, y: 0.6 }
    if (opts.origin) {
      const point = opts.origin instanceof HTMLElement
        ? (() => {
            const rect = opts.origin.getBoundingClientRect()
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          })()
        : opts.origin
      origin = { x: point.x / window.innerWidth, y: point.y / window.innerHeight }
    }
    // Above the toaster (z-100), so a burst from a moment toast falls in front of it.
    await fire({ particleCount: opts.particleCount ?? (opts.big ? 140 : 70), spread: opts.spread ?? (opts.big ? 90 : 70), angle: opts.angle ?? 90, origin, colors: COLORS, zIndex: 110, disableForReducedMotion: true })
  }

  function spark(target: SparkTarget): void {
    sparkAt(target)
  }

  return { reduced, confetti, spark, haptic }
}
