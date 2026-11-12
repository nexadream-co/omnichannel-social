import { unrefElement, useEventListener, type MaybeElementRef } from '@vueuse/core'
import type { Platform } from '#shared/channels/types'
import { haptic } from '~/utils/haptics'
import { BOARD_GAP, prefersReducedMotion, setDragFlight } from '~/utils/flip'
import type { IdeaDetail, IdeaStage } from '#shared/utils/planner'
import type { PlannerDrag } from './usePlanner'

/**
 * What the floating drag card shows while a post or an idea is carried. `card` is a board card on the Ide page:
 * the floating copy is the card itself (`idea`), at its own `size`, hanging from the point it was grabbed (`grab`).
 */
export interface DragPreview {
  kind: 'post' | 'idea' | 'card'
  title: string
  time?: string
  platforms?: Platform[]
  thumb?: string | null
  video?: boolean
  icon?: string
  touch?: boolean
  idea?: IdeaDetail
  stage?: IdeaStage
  size?: { w: number, h: number }
  grab?: { x: number, y: number }
}

/** Touch: how long a finger rests before the item lifts, and how far it may wander before that (then it is a scroll). */
const HOLD_MS = 280
const TOUCH_SLOP = 8
const MOUSE_SLOP = 4
/** Auto-scroll: distance from the scroll area's top or bottom edge where it starts, and its top speed per frame. */
const EDGE = 72
const MAX_SPEED = 18
/** Swing: the card tilts against the pointer's speed (max degrees), and the spring that settles it. */
const MAX_TILT = 14
const STIFFNESS = 0.18
const DAMPING = 0.72
const LIFT_SCALE = 1.04
const DROP_SELECTOR = '[data-drop-day],[data-drop-stage]'

/**
 * Shared while dragging: the card's content, the drop target under the pointer (a Kalender day as `2026-11-20`, or a
 * board column as `stage:drafting`) and, over a column, the index the card would take among the cards already there.
 */
export function usePlannerDragState() {
  return {
    preview: useState<DragPreview | null>('planner-drag-preview', () => null),
    over: useState<string | null>('planner-drag-over', () => null),
    slotIndex: useState<number | null>('planner-drag-slot', () => null)
  }
}

/**
 * The insertion index in a board column for a pointer at `y`: against the middle of each card, measured in the
 * list's own layout (offsets ignore the transforms that slide cards apart, so the index never jitters), without the
 * dragged card. Cards below the dragged card's own slot count as already moved up when the pointer is in its column.
 * Null when the target has no list (a phone stage chip): the card goes to the top.
 */
export function slotIndexAt(zone: HTMLElement, y: number, dragId: string): number | null {
  const list = zone.querySelector<HTMLElement>('[data-drop-list]')
  if (!list) return null
  const cards = Array.from(list.children).filter((node): node is HTMLElement => node instanceof HTMLElement && Boolean(node.dataset.ideaId))
  const ghost = cards.find(card => card.dataset.ideaId === dragId)
  const lift = ghost ? ghost.offsetHeight + BOARD_GAP : 0
  const py = y - list.getBoundingClientRect().top
  let index = 0
  for (const card of cards) {
    if (card === ghost) continue
    const top = card.offsetTop - (ghost && card.offsetTop > ghost.offsetTop ? lift : 0)
    if (py < top + card.offsetHeight / 2) break
    index++
  }
  return index
}

function scrollParent(el: HTMLElement | null | undefined, axis: 'x' | 'y' = 'y'): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    const overflow = axis === 'y' ? style.overflowY : style.overflowX
    const scrollable = axis === 'y' ? node.scrollHeight > node.clientHeight : node.scrollWidth > node.clientWidth
    if ((overflow === 'auto' || overflow === 'scroll') && scrollable) return node
  }
  return null
}

/**
 * Makes an element draggable onto Kalender days with mouse, pen or touch (HTML5 drag-and-drop has no touch).
 * Mouse: press and move. Touch: press and hold, then move; moving before the hold is an ordinary scroll.
 * The target under the pointer is any element with `data-drop-day` (a Kalender day) or `data-drop-stage` (a board
 * column or phone stage chip); on release it receives a bubbling `planner-drop` event (detail: `over`'s key), while
 * `planner.drag` and `slotIndex` still hold what was dropped and where.
 * While carried, the item swings: its tilt follows the pointer's speed through a spring (`--drag-tilt` and
 * `--drag-scale` on the root, so Vue never re-renders), and it hangs from the point it was grabbed.
 * `onHold`: a touch hold released without moving (the phone agenda opens "Pindahkan ke…").
 * `onCancel`: the item was let go over nothing, or Esc: a board card flies back to its place.
 */
export function useDragSource(target: MaybeElementRef, opts: { enabled: () => boolean, payload: () => PlannerDrag, preview: () => DragPreview, onHold?: () => void, onCancel?: () => void }) {
  const planner = usePlanner()
  const { preview, over, slotIndex } = usePlannerDragState()
  const lifted = ref(false)

  let pointerId: number | null = null
  let touch = false
  let start = { x: 0, y: 0 }
  let last = { x: 0, y: 0 }
  let liftAt = { x: 0, y: 0 }
  let wandered = 0
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let frame = 0
  let scroller: HTMLElement | null = null
  let scrollerX: HTMLElement | null = null
  let overEl: HTMLElement | null = null
  let grab = { x: 0, y: 0 }
  let size = { w: 0, h: 0 }
  let speed = 0
  let tilt = 0
  let tiltVelocity = 0
  let scale = 1
  let scaleVelocity = 0
  let tiltSign = 1
  let swallowClick = false
  let detach: (() => void) | null = null

  function locate(x: number, y: number) {
    // Sideways speed per pointer event, smoothed; the loop below turns it into a swing.
    if (lifted.value && last.x !== x) speed = speed * 0.7 + (x - last.x) * 0.3
    last = { x, y }
    const root = document.documentElement.style
    root.setProperty('--drag-x', `${x}px`)
    root.setProperty('--drag-y', `${y}px`)
    overEl = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(DROP_SELECTOR) ?? null
    const key = overEl ? (overEl.dataset.dropDay ?? `stage:${overEl.dataset.dropStage}`) : null
    if (key !== over.value) {
      over.value = key
      if (key) haptic('tick')
    }
    const payload = planner.drag.value
    const index = overEl?.dataset.dropStage && payload?.kind === 'card' ? slotIndexAt(overEl, y, payload.id) : null
    if (index !== slotIndex.value) slotIndex.value = index
  }

  /** The column under the pointer scrolls when it can (the Ide board); otherwise the item's own scroll area. */
  function activeScroller(): HTMLElement | null {
    const column = overEl?.querySelector<HTMLElement>('[data-drop-scroll]')
    if (column && column.scrollHeight > column.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(column).overflowY)) return column
    return scroller
  }

  function swing() {
    const root = document.documentElement.style
    if (prefersReducedMotion()) {
      tilt = 0
      scale = 1
    } else {
      speed *= 0.9
      const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, speed * 1.1 * tiltSign))
      tiltVelocity = (tiltVelocity + (target - tilt) * STIFFNESS) * DAMPING
      tilt += tiltVelocity
      scaleVelocity = (scaleVelocity + (LIFT_SCALE - scale) * STIFFNESS) * DAMPING
      scale += scaleVelocity
    }
    root.setProperty('--drag-tilt', `${tilt.toFixed(2)}deg`)
    root.setProperty('--drag-scale', scale.toFixed(3))
  }

  function autoScroll() {
    if (!lifted.value) return
    swing()
    const area = activeScroller()
    const box = area?.getBoundingClientRect()
    const top = Math.max(box?.top ?? 0, 0)
    const bottom = Math.min(box?.bottom ?? window.innerHeight, window.innerHeight)
    const pace = (gap: number) => Math.ceil(MAX_SPEED * Math.min(1, Math.max(0, 1 - gap / EDGE)))
    const dy = last.y < top + EDGE ? -pace(last.y - top) : last.y > bottom - EDGE ? pace(bottom - last.y) : 0
    let dx = 0
    if (scrollerX) {
      const row = scrollerX.getBoundingClientRect()
      const left = Math.max(row.left, 0)
      const right = Math.min(row.right, window.innerWidth)
      dx = last.x < left + EDGE ? -pace(last.x - left) : last.x > right - EDGE ? pace(right - last.x) : 0
    }
    if (dy) (area ?? document.scrollingElement)?.scrollBy(0, dy)
    if (dx) scrollerX?.scrollBy(dx, 0)
    if (dy || dx) locate(last.x, last.y)
    frame = requestAnimationFrame(autoScroll)
  }

  function lift(x: number, y: number) {
    lifted.value = true
    liftAt = { x, y }
    wandered = 0
    planner.drag.value = opts.payload()
    const box = el.value?.getBoundingClientRect()
    size = { w: box?.width ?? 0, h: box?.height ?? 0 }
    grab = { x: box ? x - box.left : 0, y: box ? y - box.top : 0 }
    speed = 0
    tilt = 0
    tiltVelocity = 0
    scale = 1
    scaleVelocity = 0
    // Hung from above the middle the card trails the pointer clockwise; hung from below, the other way.
    tiltSign = grab.y <= size.h / 2 ? 1 : -1
    preview.value = { ...opts.preview(), touch, size, grab }
    scroller = scrollParent(el.value)
    scrollerX = scrollParent(el.value, 'x')
    const root = document.documentElement.style
    root.setProperty('--drag-ox', `${grab.x}px`)
    root.setProperty('--drag-oy', `${grab.y}px`)
    root.setProperty('--drag-tilt', '0deg')
    root.setProperty('--drag-scale', '1')
    document.documentElement.classList.add('planner-dragging')
    last = { x, y }
    locate(x, y)
    haptic('tick')
    frame = requestAnimationFrame(autoScroll)
  }

  function finish(drop: boolean) {
    clearTimeout(holdTimer)
    detach?.()
    detach = null
    pointerId = null
    if (!lifted.value) return
    cancelAnimationFrame(frame)
    lifted.value = false
    document.documentElement.classList.remove('planner-dragging')
    // The release may also end in a click on the item (a link to the post): that click must not navigate. The
    // next press on the item starts a new gesture and clears this.
    swallowClick = true
    setTimeout(() => {
      swallowClick = false
    }, 400)
    const held = touch && wandered < TOUCH_SLOP
    if (drop && held && opts.onHold) {
      reset()
      opts.onHold()
      return
    }
    setDragFlight({ left: last.x - grab.x, top: last.y - grab.y, width: size.w, height: size.h, ox: grab.x, oy: grab.y, tilt, scale })
    if (drop && overEl && over.value) overEl.dispatchEvent(new CustomEvent('planner-drop', { bubbles: true, detail: over.value }))
    else opts.onCancel?.()
    reset()
  }

  function reset() {
    planner.drag.value = null
    preview.value = null
    over.value = null
    slotIndex.value = null
    overEl = null
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    if (lifted.value) {
      wandered = Math.max(wandered, Math.hypot(event.clientX - liftAt.x, event.clientY - liftAt.y))
      locate(event.clientX, event.clientY)
      return
    }
    last = { x: event.clientX, y: event.clientY }
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (!touch && distance > MOUSE_SLOP) lift(event.clientX, event.clientY)
    else if (touch && distance > TOUCH_SLOP) finish(false)
  }

  function down(event: PointerEvent) {
    if (!opts.enabled() || event.button !== 0 || pointerId !== null || planner.drag.value) return
    // Buttons inside the item (its ⋯ menu) keep working as buttons.
    if ((event.target as HTMLElement | null)?.closest('[data-no-drag]')) return
    pointerId = event.pointerId
    swallowClick = false
    touch = event.pointerType !== 'mouse'
    start = { x: event.clientX, y: event.clientY }
    last = start
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && finish(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    detach = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
    }
    if (touch) holdTimer = setTimeout(() => lift(last.x, last.y), HOLD_MS)
  }

  const el = computed(() => unrefElement(target) as HTMLElement | null | undefined)
  useEventListener(el, 'pointerdown', down)
  // Registered up front and not passive, so once the item is lifted the finger moves it instead of scrolling the page.
  useEventListener(el, 'touchmove', (event: TouchEvent) => {
    if (lifted.value) event.preventDefault()
  }, { passive: false })
  useEventListener(el, 'contextmenu', (event: Event) => {
    if (opts.enabled() && touch) event.preventDefault()
  })
  useEventListener(el, 'dragstart', (event: Event) => event.preventDefault())
  useEventListener(el, 'click', (event: Event) => {
    if (!swallowClick) return
    swallowClick = false
    event.preventDefault()
    event.stopPropagation()
  }, { capture: true })

  onScopeDispose(() => finish(false))

  return { lifted }
}
