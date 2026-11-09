/**
 * Drop-target state for the Kalender (week and month grids, phone agenda): which day is under the pointer, whether
 * it is a valid target (never the past), and a short "settled" flag after a drop. Day elements carry
 * `data-drop-day` and listen for `planner-drop` (see useDragSource).
 */
export function usePlannerDrop(today: () => string, onDrop: (day: string) => void) {
  const planner = usePlanner()
  const { over } = usePlannerDragState()
  const settled = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(timer))

  const dragging = computed(() => planner.drag.value !== null)
  const isPast = (day: string) => planner.isPastDrop(day, today())

  /** 'ok' / 'past': the day under the pointer; 'target' / 'blocked': any other day while something is carried. */
  const state = (day: string): 'ok' | 'past' | 'target' | 'blocked' | null => {
    if (!dragging.value) return null
    if (over.value === day) return isPast(day) ? 'past' : 'ok'
    return isPast(day) ? 'blocked' : 'target'
  }

  function drop(day: string) {
    if (!isPast(day)) {
      settled.value = day
      clearTimeout(timer)
      timer = setTimeout(() => {
        settled.value = null
      }, 600)
    }
    onDrop(day)
  }

  return { settled, state, drop, dragging }
}
