<script setup lang="ts">
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
async function capture() {
  const title = draft.value.trim()
  if (!title || capturing.value) return
  capturing.value = true
  try {
    await apiFetch('/api/app/planner/ideas', { method: 'POST', body: { title } })
    draft.value = ''
    view.value = 'unplanned'
  } catch (caught) {
    planner.fail(caught)
  } finally {
    capturing.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <form
      v-if="canWrite"
      class="flex gap-2"
      @submit.prevent="capture"
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
        icon="i-lucide-plus"
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
    <p
      v-else-if="!list.items.value.length"
      class="text-sm text-muted text-center py-8 px-2"
    >
      {{ view === 'unplanned' ? t('planner.bank.emptyUnplanned') : t('planner.bank.emptyOther') }}
    </p>
    <ul
      v-else
      class="space-y-2"
    >
      <li
        v-for="idea in list.items.value"
        :key="idea.id"
      >
        <IdeaCard
          :idea="idea"
          @open="emit('open', $event)"
        />
      </li>
    </ul>
    <p
      v-if="canWrite && list.items.value.length && (view === 'unplanned' || view === 'planned')"
      class="text-xs text-muted hidden lg:block"
    >
      {{ t('planner.bank.dragHint') }}
    </p>
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
