import { unrefElement, useEventListener, type MaybeElementRef } from '@vueuse/core'
import type { Platform } from '#shared/channels/types'
import { haptic } from '~/utils/haptics'
import type { PlannerDrag } from './usePlanner'

/** What the floating drag card shows while a post or an idea is carried over the Kalender. */
export interface DragPreview { kind: 'post' | 'idea', title: string, time?: string, platforms?: Platform[], thumb?: string | null, video?: boolean, icon?: string, touch?: boolean }

/** Touch: how long a finger rests before the item lifts, and how far it may wander before that (then it is a scroll). */
const HOLD_MS = 280
const TOUCH_SLOP = 8
const MOUSE_SLOP = 4
/** Auto-scroll: distance from the scroll area's top or bottom edge where it starts, and its top speed per frame. */
const EDGE = 72
const MAX_SPEED = 18

/** Shared while dragging: the card's content and the day under the pointer (`data-drop-day` of the element there). */
export function usePlannerDragState() {
  return {
    preview: useState<DragPreview | null>('planner-drag-preview', () => null),
    over: useState<string | null>('planner-drag-over', () => null)
  }
}

function scrollParent(el: HTMLElement | null | undefined): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/**
 * Makes an element draggable onto Kalender days with mouse, pen or touch (HTML5 drag-and-drop has no touch).
 * Mouse: press and move. Touch: press and hold, then move; moving before the hold is an ordinary scroll.
 * The day under the pointer is any element with `data-drop-day`; on release it receives a bubbling
 * `planner-drop` event (detail: the day), while `planner.drag` still holds what was dropped.
 * `onHold`: a touch hold released without moving (the phone agenda opens "Pindahkan ke…").
 */
export function useDragSource(target: MaybeElementRef, opts: { enabled: () => boolean, payload: () => PlannerDrag, preview: () => DragPreview, onHold?: () => void }) {
  const planner = usePlanner()
  const { preview, over } = usePlannerDragState()
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
  let overEl: HTMLElement | null = null
  let swallowClick = false
  let detach: (() => void) | null = null

  function locate(x: number, y: number) {
    last = { x, y }
    const root = document.documentElement.style
    root.setProperty('--drag-x', `${x}px`)
    root.setProperty('--drag-y', `${y}px`)
    overEl = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop-day]') ?? null
    const day = overEl?.dataset.dropDay ?? null
    if (day !== over.value) {
      over.value = day
      if (day) haptic('tick')
    }
  }

  function autoScroll() {
    if (!lifted.value) return
    const box = scroller?.getBoundingClientRect()
    const top = Math.max(box?.top ?? 0, 0)
    const bottom = Math.min(box?.bottom ?? window.innerHeight, window.innerHeight)
    const speed = (gap: number) => Math.ceil(MAX_SPEED * Math.min(1, Math.max(0, 1 - gap / EDGE)))
    const dy = last.y < top + EDGE ? -speed(last.y - top) : last.y > bottom - EDGE ? speed(bottom - last.y) : 0
    if (dy) {
      (scroller ?? document.scrollingElement)?.scrollBy(0, dy)
      locate(last.x, last.y)
    }
    frame = requestAnimationFrame(autoScroll)
  }

  function lift(x: number, y: number) {
    lifted.value = true
    liftAt = { x, y }
    wandered = 0
    planner.drag.value = opts.payload()
    preview.value = { ...opts.preview(), touch }
    scroller = scrollParent(el.value)
    document.documentElement.classList.add('planner-dragging')
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
    if (drop && overEl && over.value) overEl.dispatchEvent(new CustomEvent('planner-drop', { bubbles: true, detail: over.value }))
    reset()
  }

  function reset() {
    planner.drag.value = null
    preview.value = null
    over.value = null
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
