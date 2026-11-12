import { moveCheck, type IdeaStage } from '#shared/utils/planner'

/** The empty slot on the Ide board: where the carried card would land, in which column, and whether it needs confirming. */
export interface BoardSlot {
  id: string
  from: IdeaStage
  stage: IdeaStage
  index: number
  height: number
  honest: boolean
}

/**
 * While a card is carried, the slot follows the pointer (`over` + `slotIndex`). After the drop of a move that needs
 * confirming, it stays where it is (`pending`) while the dialog is open, and the card stays a ghost in its column.
 */
export function useBoardSlot() {
  const planner = usePlanner()
  const { over, preview, slotIndex } = usePlannerDragState()
  const pending = useState<BoardSlot | null>('board-pending-slot', () => null)

  const slot = computed<BoardSlot | null>(() => {
    const item = planner.drag.value
    if (item?.kind === 'card' && over.value?.startsWith('stage:')) {
      const stage = over.value.slice(6) as IdeaStage
      return {
        id: item.id,
        from: item.from,
        stage,
        index: slotIndex.value ?? 0,
        height: Math.max(preview.value?.size?.h ?? 0, 56),
        honest: stage === item.from || moveCheck(item.actual, stage) === null
      }
    }
    return pending.value
  })
  const ghostId = computed(() => {
    const item = planner.drag.value
    return item?.kind === 'card' ? item.id : pending.value?.id ?? null
  })
  /** Whether a card is being carried over a column of this stage (a phone chip also counts). */
  const hovering = (stage: IdeaStage) => slot.value?.stage === stage

  return { slot, pending, ghostId, hovering }
}
