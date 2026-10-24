import { haptic } from '~/utils/haptics'
import { isPastSlot } from '~/utils/schedule'

/**
 * Drop-target state for the desktop week and month grids: which day is under the pointer, whether it is a valid
 * target (never the past), and a short "settled" flag after a drop. Pairs with `planner.drag`.
 */
export function usePlannerDrop(today: () => string, onDrop: (day: string) => void) {
  const planner = usePlanner()
  const auth = useCreatorAuth()
  const over = ref<string | null>(null)
  const settled = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  // The drag ended (dropped or cancelled): nothing is highlighted any more.
  watch(planner.drag, (value) => {
    if (!value) over.value = null
    else haptic('tick')
  })
  onScopeDispose(() => clearTimeout(timer))

  /** A day before today, or, for a post (which keeps its time of day), a time on today that already passed. */
  const isPast = (day: string) => {
    if (day < today()) return true
    const item = planner.drag.value
    return item?.kind === 'post' && isPastSlot(day, item.time, auth.profile.value?.displayTimezone ?? 'Asia/Jakarta')
  }

  const dragging = computed(() => planner.drag.value !== null)
  /** 'ok': a valid day under the pointer; 'past': a day in the past under the pointer; null: not hovered. */
  const state = (day: string): 'ok' | 'past' | null => {
    if (!dragging.value || over.value !== day) return null
    return isPast(day) ? 'past' : 'ok'
  }

  function dragover(day: string, event: DragEvent) {
    event.preventDefault()
    over.value = day
    if (event.dataTransfer) event.dataTransfer.dropEffect = isPast(day) ? 'none' : 'move'
  }

  function drop(day: string) {
    over.value = null
    if (!isPast(day)) {
      settled.value = day
      clearTimeout(timer)
      timer = setTimeout(() => {
        settled.value = null
      }, 200)
    }
    onDrop(day)
  }

  return { over, settled, state, dragover, drop, dragging }
}
