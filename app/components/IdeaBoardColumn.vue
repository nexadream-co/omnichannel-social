<script setup lang="ts">
import { IDEA_TITLE_MAX, type IdeaDetail, type IdeaStage } from '#shared/utils/planner'
import { BOARD_GAP } from '~/utils/flip'
import { haptic } from '~/utils/haptics'
import { CONFIRM_STYLE, STAGE_STYLE } from '~/utils/ideaBoard'

/**
 * One column of the Ide board: its own server list (20 at a time), a quick capture on top of "Ide mentah", and the
 * drop zone for carried cards. While a card hovers here, an empty slot opens at the exact index the pointer is at
 * and the cards below slide apart. Cards are moved with transforms only, so their layout positions (and the index
 * measured from them) never change under the pointer.
 */
const props = defineProps<{ stage: IdeaStage }>()
const emit = defineEmits<{ open: [idea: IdeaDetail], move: [idea: IdeaDetail] }>()
const { t } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()
const { slot, ghostId } = useBoardSlot()
const landing = useState<string | null>('board-landing', () => null)

const canWrite = computed(() => auth.hasAbility('posts.write'))
const style = computed(() => STAGE_STYLE[props.stage])
const filters = computed(() => ({ stage: props.stage }))
const list = useServerList<IdeaDetail>('/api/app/planner/ideas', { filters, limit: 20 })
onMounted(list.refresh)

const items = list.items
const loadingFirst = computed(() => list.status.value === 'loading' && !items.value.length)
const canLoadMore = computed(() => list.total.value > items.value.length && list.limit.value < 100)
function loadMore() {
  list.limit.value = Math.min(100, list.limit.value + 20)
  void list.refresh()
}

// ---- Quick capture (Ide mentah) and starter ideas ----
const draft = ref('')
const capturing = ref(false)
const pop = useCheckPop()
async function capture(text = draft.value) {
  const title = text.trim()
  if (!title || capturing.value) return
  capturing.value = true
  const saved = await planner.captureIdea(title)
  capturing.value = false
  if (!saved) return
  draft.value = ''
  pop.trigger()
  haptic('tick')
}
const starters = computed(() => [t('planner.bank.starters.best'), t('planner.bank.starters.unboxing'), t('planner.bank.starters.racun')])

// ---- Drop slot and sibling shifts ----
const listEl = ref<HTMLElement | null>(null)
const mine = computed(() => slot.value && slot.value.stage === props.stage ? slot.value : null)
const lastSlot = ref(mine.value)
watch(mine, (value) => {
  if (value) lastSlot.value = value
})
const others = computed(() => items.value.filter(i => i.id !== ghostId.value))
const ghostAt = computed(() => items.value.findIndex(i => i.id === ghostId.value))

function shiftOf(id: string): number {
  const s = mine.value
  if (!s) return 0
  let y = 0
  const at = items.value.findIndex(i => i.id === id)
  if (ghostAt.value >= 0 && at > ghostAt.value) y -= s.height + BOARD_GAP
  if (others.value.findIndex(i => i.id === id) >= s.index) y += s.height + BOARD_GAP
  return y
}

const slotTop = ref(0)
const instant = ref(false)
const suppressed = ref(false)
function afterFrames(done: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(done))
}
/** The slot appears where it is, not sliding in from where it was last. */
watch(() => mine.value !== null, (active) => {
  if (!active) return
  instant.value = true
  afterFrames(() => {
    instant.value = false
  })
}, { flush: 'sync' })
/** No transitions for a moment: a card has just been inserted or removed, and the siblings must not slide twice. */
function suppress() {
  suppressed.value = true
  afterFrames(() => {
    suppressed.value = false
  })
}

function measure() {
  const s = mine.value
  const ul = listEl.value
  if (!s || !ul) return
  const cards = Array.from(ul.children).filter((node): node is HTMLElement => node instanceof HTMLElement && Boolean(node.dataset.ideaId))
  const ghost = cards.find(card => card.dataset.ideaId === ghostId.value)
  const rest = cards.filter(card => card !== ghost)
  const base = (card: HTMLElement) => ghost && card.offsetTop > ghost.offsetTop ? -(s.height + BOARD_GAP) : 0
  const target = rest[s.index]
  const last = rest.at(-1)
  slotTop.value = target ? target.offsetTop + base(target) : last ? last.offsetTop + last.offsetHeight + BOARD_GAP + base(last) : 0
}
watch(() => [mine.value?.index ?? -1, items.value.length, ghostId.value], measure, { flush: 'post' })

// ---- Column feedback after a drop ----
const flash = ref(false)
const bounce = ref(0)
function celebrate() {
  flash.value = false
  void nextTick(() => {
    flash.value = true
    bounce.value++
    setTimeout(() => {
      flash.value = false
    }, 700)
  })
}

// ---- What the board page needs ----
function removeById(id: string) {
  if (!items.value.some(i => i.id === id)) return
  items.value = items.value.filter(i => i.id !== id)
  list.total.value = Math.max(0, list.total.value - 1)
}
function insertAt(idea: IdeaDetail, index: number) {
  const rest = items.value.filter(i => i.id !== idea.id)
  rest.splice(Math.min(Math.max(index, 0), rest.length), 0, idea)
  items.value = rest
  list.total.value += 1
}
function snapshot() {
  return { items: items.value, total: list.total.value }
}
function restore(value: { items: IdeaDetail[], total: number }) {
  items.value = value.items
  list.total.value = value.total
}
defineExpose({ items, total: list.total, removeById, insertAt, snapshot, restore, suppress, celebrate, refresh: list.refresh })
</script>

<template>
  <section
    :data-drop-stage="stage"
    :aria-label="t(`ideas.stage.${stage}`)"
    class="flex flex-col min-w-0 rounded-xl border border-default bg-elevated/40 ring-2 ring-transparent motion-safe:transition-[background-color,box-shadow] duration-200 lg:h-[calc(100dvh-14.5rem)] lg:min-h-[26rem]"
    :class="[mine ? (mine.honest ? style.hover : CONFIRM_STYLE.hover) : '', flash ? 'animate-ring-pulse' : '']"
  >
    <header class="flex items-center gap-2 px-3 py-2.5">
      <span
        class="size-2.5 rounded-full shrink-0"
        :class="style.dot"
        aria-hidden="true"
      />
      <h2 class="font-semibold text-highlighted text-sm truncate">
        {{ t(`ideas.stage.${stage}`) }}
      </h2>
      <UBadge
        :key="bounce"
        color="neutral"
        variant="subtle"
        size="sm"
        class="ml-auto tabular-nums"
        :class="bounce ? 'motion-safe:animate-count-bounce' : ''"
        :label="String(list.total.value)"
      />
    </header>

    <div
      data-drop-scroll
      class="flex-1 min-h-0 px-2 pb-2 flex flex-col gap-2 lg:overflow-y-auto lg:overscroll-contain"
    >
      <form
        v-if="stage === 'raw' && canWrite"
        class="flex gap-2"
        @submit.prevent="capture()"
      >
        <UInput
          v-model="draft"
          :placeholder="t('planner.bank.capturePlaceholder')"
          :maxlength="IDEA_TITLE_MAX"
          icon="i-lucide-lightbulb"
          class="flex-1 min-w-0"
        />
        <UButton
          type="submit"
          :icon="pop.done.value ? 'i-lucide-check' : 'i-lucide-plus'"
          :color="pop.done.value ? 'success' : 'primary'"
          :loading="capturing"
          :disabled="!draft.trim()"
          :aria-label="t('planner.bank.capture')"
        />
      </form>

      <div
        v-if="loadingFirst"
        class="flex flex-col gap-2"
      >
        <USkeleton
          v-for="n in 2"
          :key="n"
          class="h-28 w-full"
        />
      </div>

      <EmptyState
        v-else-if="list.status.value === 'error' && !items.length"
        icon="i-lucide-cloud-off"
        :title="t('ideas.loadError')"
        :action="{ label: t('common.retry'), icon: 'i-lucide-refresh-cw', onClick: list.refresh }"
        compact
      />

      <EmptyState
        v-else-if="!items.length"
        :icon="style.icon"
        :title="t(`ideas.empty.${stage}.title`)"
        :description="t(`ideas.empty.${stage}.body`)"
        compact
        class="motion-safe:transition-opacity"
        :class="mine ? 'opacity-30' : ''"
      >
        <div
          v-if="stage === 'raw' && canWrite"
          class="flex flex-wrap justify-center gap-2"
        >
          <UButton
            v-for="starter in starters"
            :key="starter"
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="starter"
            :disabled="capturing"
            @click="capture(starter)"
          />
        </div>
      </EmptyState>

      <ul
        ref="listEl"
        data-drop-list
        class="relative flex flex-col gap-2 motion-safe:transition-[padding] duration-200"
        :class="suppressed ? 'transition-none' : ''"
        :style="{ paddingBottom: mine ? `${mine.height + BOARD_GAP}px` : undefined }"
      >
        <li
          aria-hidden="true"
          class="absolute inset-x-0 top-0 rounded-lg border-2 border-dashed pointer-events-none ease-[cubic-bezier(0.34,1.3,0.64,1)] duration-200"
          :class="[lastSlot && !lastSlot.honest ? CONFIRM_STYLE.slot : style.slot, instant || suppressed ? 'transition-none' : 'motion-safe:transition-[transform,height,opacity]']"
          :style="{ transform: `translateY(${slotTop}px)`, height: mine ? `${mine.height}px` : '0px', opacity: mine ? 1 : 0 }"
        />
        <li
          v-for="idea in items"
          :key="idea.id"
          :data-idea-id="idea.id"
          :class="landing === idea.id ? '' : 'motion-safe:animate-card-in'"
        >
          <div
            class="ease-[cubic-bezier(0.34,1.3,0.64,1)] duration-200"
            :class="[instant || suppressed ? 'transition-none' : 'motion-safe:transition-[transform,opacity]', mine && idea.id === ghostId ? 'opacity-0 pointer-events-none' : '']"
            :style="{ transform: shiftOf(idea.id) ? `translateY(${shiftOf(idea.id)}px)` : undefined }"
          >
            <IdeaBoardCard
              :idea="idea"
              :ghost="idea.id === ghostId"
              @open="emit('open', $event)"
              @move="emit('move', $event)"
            />
          </div>
        </li>
      </ul>

      <UButton
        v-if="canLoadMore"
        color="neutral"
        variant="soft"
        size="sm"
        class="self-center"
        :label="t('ideas.loadMore')"
        :loading="list.status.value === 'loading'"
        @click="loadMore"
      />
    </div>
  </section>
</template>
