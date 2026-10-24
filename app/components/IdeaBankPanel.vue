<script setup lang="ts">
import { haptic } from '~/utils/haptics'
import { IDEA_TITLE_MAX, IDEA_VIEWS, type IdeaDetail, type IdeaView } from '#shared/utils/planner'

/** Bank Ide: capture an idea in one line, browse ideas by state, drag one onto the Kalender (desktop). */
const emit = defineEmits<{ open: [idea: IdeaDetail] }>()
const { t } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const view = ref<IdeaView>('unplanned')
const filters = computed(() => ({ view: view.value }))
const list = useServerList<IdeaDetail>('/api/app/planner/ideas', { filters, limit: 20 })
onMounted(list.refresh)

const viewItems = computed(() => IDEA_VIEWS.map(value => ({ value, label: t(`planner.bank.views.${value}`) })))

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
  view.value = 'unplanned'
  pop.trigger()
  haptic('tick')
}

// Starter ideas for an empty bank: one tap saves one.
const starters = computed(() => [t('planner.bank.starters.best'), t('planner.bank.starters.unboxing'), t('planner.bank.starters.racun')])

const scheduling = ref<IdeaDetail | null>(null)
const sheetOpen = computed({ get: () => scheduling.value !== null, set: (value) => {
  if (!value) scheduling.value = null
} })
function schedule(value: { date: string }) {
  const idea = scheduling.value
  if (idea) void planner.planIdea(idea.id, value.date, idea.plannedOn ?? null)
}
</script>

<template>
  <div class="space-y-3">
    <form
      v-if="canWrite"
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
    <USelect
      v-model="view"
      :items="viewItems"
      size="sm"
      class="w-full"
    />
    <div
      v-if="list.status.value === 'loading' && !list.items.value.length"
      class="space-y-2"
    >
      <USkeleton
        v-for="n in 3"
        :key="n"
        class="h-16 w-full"
      />
    </div>
    <EmptyState
      v-else-if="!list.items.value.length && view === 'unplanned'"
      icon="i-lucide-lightbulb"
      :title="t('planner.bank.emptyTitle')"
      :description="t('planner.bank.emptyUnplanned')"
      compact
    >
      <div
        v-if="canWrite"
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
    <EmptyState
      v-else-if="!list.items.value.length"
      icon="i-lucide-lightbulb"
      :title="t('planner.bank.emptyOther')"
      compact
    />
    <TransitionGroup
      v-else
      name="list"
      tag="ul"
      class="space-y-2"
    >
      <li
        v-for="idea in list.items.value"
        :key="idea.id"
      >
        <IdeaCard
          :idea="idea"
          @open="emit('open', $event)"
          @schedule="scheduling = $event"
        />
      </li>
    </TransitionGroup>
    <p
      v-if="canWrite && list.items.value.length && (view === 'unplanned' || view === 'planned')"
      class="text-xs text-muted hidden lg:block"
    >
      {{ t('planner.bank.dragHint') }}
    </p>
    <CalendarMoveSheet
      v-model:open="sheetOpen"
      mode="idea"
      :title="t('calendar.scheduleIdeaTitle')"
      :date="scheduling?.plannedOn ?? null"
      :tz="planner.tzOf()"
      @save="schedule"
    />
    <div
      v-if="list.pageCount.value > 1"
      class="flex justify-center"
    >
      <UPagination
        v-model:page="list.page.value"
        :total="list.total.value"
        :items-per-page="list.limit.value"
        size="sm"
      />
    </div>
  </div>
</template>
