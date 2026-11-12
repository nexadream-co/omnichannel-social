<script setup lang="ts">
import { IDEA_STAGES, moveCheck, type IdeaDetail, type IdeaStage, type MoveReason } from '#shared/utils/planner'
import type IdeaBoardColumn from '~/components/IdeaBoardColumn.vue'
import { flipFrom, takeDragFlight, type DragFlight } from '~/utils/flip'
import { haptic } from '~/utils/haptics'
import { STAGE_STYLE } from '~/utils/ideaBoard'

/**
 * Ide: every idea as a card on a board, from a raw one-liner to a post that went live. Cards move between columns
 * and within one by drag and drop (or "Pindahkan ke…" on phones). The server moves cards by itself when their post
 * changes; a card moved by hand stays where it was put, and a move that does not match reality asks first.
 */
type Column = InstanceType<typeof IdeaBoardColumn>

definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const planner = usePlanner()
const confirmDialog = useConfirmDialog()
const { pending, hovering } = useBoardSlot()
const { slotIndex } = usePlannerDragState()
const landing = useState<string | null>('board-landing', () => null)
useHead({ title: () => t('ideas.title') })

const canWrite = computed(() => auth.hasAbility('posts.write'))

const cols = shallowReactive<Partial<Record<IdeaStage, Column>>>({})
const active = ref<IdeaStage>('raw')
const counts = computed(() => Object.fromEntries(IDEA_STAGES.map(stage => [stage, cols[stage]?.total ?? 0])) as Record<IdeaStage, number>)

// ---- Editor, archive, "Pindahkan ke…" ----
const editorOpen = ref(false)
const editing = ref<IdeaDetail | null>(null)
function newIdea() {
  editing.value = null
  editorOpen.value = true
}
function openIdea(idea: IdeaDetail) {
  archiveOpen.value = false
  editing.value = idea
  editorOpen.value = true
}
const archiveOpen = ref(false)
const moving = ref<IdeaDetail | null>(null)
const moveOpen = computed({ get: () => moving.value !== null, set: (value) => {
  if (!value) moving.value = null
} })

// ---- Moving a card ----
function findIdea(id: string): IdeaDetail | null {
  for (const stage of IDEA_STAGES) {
    const found = cols[stage]?.items.find(i => i.id === id)
    if (found) return found
  }
  return null
}
const cardEl = (id: string) => document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)

/** The card goes where it was let go, or springs back into its own slot. */
function settle(id: string, flight: DragFlight | null) {
  void nextTick(() => {
    const el = cardEl(id)
    if (flight && el) flipFrom(el, flight)
  })
}

const STAYS = { scheduled: 'scheduled', published: 'published', failed: 'failed' } as const
function extraFor(reason: MoveReason, idea: IdeaDetail): { label: string, go: () => unknown } | null {
  if (reason === 'post_stays') return idea.postId ? { label: t('planner.idea.openPost'), go: () => navigateTo(localePath(`/app/posts/${idea.postId}`)) } : null
  if (reason === 'no_schedule' || reason === 'not_live') {
    if (idea.post && ['draft', 'cancelled'].includes(idea.post.status)) return { label: t('ideas.confirm.finishPost'), go: () => navigateTo(localePath(`/app/posts/${idea.post!.id}`)) }
    if (idea.status === 'open' && !idea.postId) return { label: t('ideas.confirm.scheduleNow'), go: () => planner.toPost(idea.id) }
  }
  return null
}
function askMove(reason: MoveReason, idea: IdeaDetail) {
  const extra = extraFor(reason, idea)
  const state = reason === 'post_stays' && idea.actualStage in STAYS ? t(`ideas.confirm.stays.${idea.actualStage}`) : ''
  return confirmDialog.choose({
    title: t(`ideas.confirm.${reason}.title`),
    description: t(`ideas.confirm.${reason}.body`, { state }),
    confirmLabel: t('ideas.confirm.keep'),
    color: 'warning',
    extraLabel: extra?.label,
    extraIcon: extra ? 'i-lucide-arrow-right' : undefined
  }).then(async (answer) => {
    if (answer === 'extra') await extra?.go()
    return answer
  })
}

/**
 * Places `idea` in `to` at `index` (among the cards already there, null: the top). The card moves at once; the save
 * follows with an "Urungkan" toast. Nothing changes if it is dropped where it already is. A move that does not match
 * the idea's real state keeps its slot open while the dialog asks.
 */
async function performMove(idea: IdeaDetail, to: IdeaStage, index: number | null, flight: DragFlight | null = null) {
  const src = cols[idea.stage]
  const tgt = cols[to]
  if (!src || !tgt) return
  const same = idea.stage === to
  const place = () => {
    const rest = tgt.items.filter(i => i.id !== idea.id)
    const at = index === null ? 0 : Math.min(index, rest.length)
    return { at, afterId: at > 0 ? rest[at - 1]!.id : null }
  }
  const before = () => {
    const pos = src.items.findIndex(i => i.id === idea.id)
    return pos > 0 ? src.items[pos - 1]!.id : null
  }
  let target = place()
  if (same && (index === null || target.afterId === before())) return settle(idea.id, flight)

  const reason = same ? null : moveCheck(idea.actualStage, to)
  if (reason) {
    pending.value = { id: idea.id, from: idea.stage, stage: to, index: target.at, height: Math.max(flight?.height ?? 0, 56), honest: false }
    const answer = await askMove(reason, idea)
    if (answer !== 'confirm') {
      pending.value = null
      haptic('warn')
      return settle(idea.id, flight)
    }
    target = place()
  }

  const origin = { from: idea.stage, afterId: before() }
  const snapshot = { src: src.snapshot(), tgt: tgt.snapshot() }
  src.suppress()
  tgt.suppress()
  landing.value = idea.id
  src.removeById(idea.id)
  tgt.insertAt({ ...idea, stage: to }, target.at)
  pending.value = null
  tgt.celebrate()
  settle(idea.id, flight)
  setTimeout(() => {
    landing.value = null
  }, 700)
  await planner.moveStage(idea.id, to, target.afterId, origin, {
    rollback: () => {
      src.suppress()
      tgt.suppress()
      src.restore(snapshot.src)
      tgt.restore(snapshot.tgt)
    }
  })
}

/** A carried card was let go over a column (its slot index is in the drag state) or a phone stage chip (top of the column). */
function onDrop(event: Event) {
  const key = (event as CustomEvent<string>).detail
  const item = planner.drag.value
  if (item?.kind !== 'card' || typeof key !== 'string' || !key.startsWith('stage:')) return
  const idea = findIdea(item.id)
  const flight = takeDragFlight()
  if (idea) void performMove(idea, key.slice(6) as IdeaStage, slotIndex.value, flight)
}
</script>

<template>
  <div
    class="w-full max-w-screen-2xl mx-auto"
    @planner-drop="onDrop"
  >
    <CommandBar
      :title="t('ideas.title')"
      :description="t('ideas.subtitle')"
    >
      <UButton
        icon="i-lucide-archive"
        color="neutral"
        variant="outline"
        :label="t('ideas.archive')"
        @click="archiveOpen = true"
      />
      <UButton
        v-if="canWrite"
        icon="i-lucide-lightbulb"
        :label="t('planner.idea.new')"
        @click="newIdea"
      />
    </CommandBar>

    <div
      class="md:hidden -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1"
      role="tablist"
      :aria-label="t('ideas.title')"
    >
      <button
        v-for="stage in IDEA_STAGES"
        :key="stage"
        type="button"
        role="tab"
        :aria-selected="active === stage"
        :data-drop-stage="stage"
        class="shrink-0 min-h-11 flex items-center gap-2 rounded-full border px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary motion-safe:transition-[background-color,box-shadow]"
        :class="[active === stage ? 'border-accented bg-elevated text-highlighted font-medium' : 'border-default text-muted', hovering(stage) ? 'ring-2 ring-primary bg-primary/10' : '']"
        @click="active = stage"
      >
        <span
          class="size-2.5 rounded-full"
          :class="STAGE_STYLE[stage].dot"
          aria-hidden="true"
        />
        {{ t(`ideas.stage.${stage}`) }}
        <span class="tabular-nums text-xs text-muted">{{ counts[stage] }}</span>
      </button>
    </div>

    <div class="board-snap flex gap-3 md:overflow-x-auto md:snap-x md:snap-mandatory md:pb-3 lg:overflow-visible lg:pb-0">
      <div
        v-for="stage in IDEA_STAGES"
        :key="stage"
        class="min-w-0 w-full md:w-72 md:shrink-0 md:snap-start lg:w-auto lg:flex-1 lg:shrink"
        :class="active === stage ? 'block' : 'hidden md:block'"
      >
        <IdeaBoardColumn
          :ref="(el: unknown) => { cols[stage] = (el as Column | null) ?? undefined }"
          :stage="stage"
          @open="openIdea"
          @move="moving = $event"
        />
      </div>
    </div>

    <p
      v-if="canWrite"
      class="text-xs text-muted mt-3"
    >
      <span class="hidden lg:inline">{{ t('ideas.dragHint') }}</span>
      <span class="lg:hidden">{{ t('ideas.dragHintTouch') }}</span>
    </p>

    <IdeaEditor
      v-model:open="editorOpen"
      :idea="editing"
      :planned-on="null"
    />
    <IdeaArchiveSheet
      v-model:open="archiveOpen"
      @open="openIdea"
    />
    <IdeaMoveSheet
      v-model:open="moveOpen"
      :idea="moving"
      @pick="stage => moving && performMove(moving, stage, null)"
    />
    <PlannerDragLayer />
  </div>
</template>
