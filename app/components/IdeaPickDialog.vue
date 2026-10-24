<script setup lang="ts">
import { PILLAR_META, type IdeaDetail } from '#shared/utils/planner'

/** "Isi" an empty day: put an idea from Bank Ide on it, write a new one, or go straight to the composer. */
const props = defineProps<{ day: string | null }>()
const emit = defineEmits<{ close: [], newIdea: [day: string] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const planner = usePlanner()

const open = computed({ get: () => Boolean(props.day), set: value => !value && emit('close') })
const ideas = shallowRef<IdeaDetail[]>([])
const loading = ref(false)
watch(() => props.day, async (day) => {
  if (!day) return
  loading.value = true
  try {
    ideas.value = (await apiFetch<{ items: IdeaDetail[] }>('/api/app/planner/ideas', { query: { view: 'unplanned', limit: 50 } })).items
  } catch (caught) {
    planner.fail(caught)
  } finally {
    loading.value = false
  }
})

async function pick(idea: IdeaDetail) {
  if (props.day && await planner.planIdea(idea.id, props.day)) emit('close')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="day ? t('planner.pick.title', { date: planner.dayLabel(day) }) : ''"
  >
    <template #body>
      <div class="space-y-4">
        <div
          v-if="loading"
          class="space-y-2"
        >
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-11 w-full"
          />
        </div>
        <EmptyState
          v-else-if="!ideas.length"
          icon="i-lucide-lightbulb"
          :title="t('planner.pick.empty')"
          compact
        />
        <ul
          v-else
          class="space-y-2 max-h-80 overflow-y-auto"
        >
          <li
            v-for="idea in ideas"
            :key="idea.id"
          >
            <button
              type="button"
              class="w-full text-left rounded-md border border-dashed border-accented px-3 py-2.5 hover:bg-elevated flex items-center gap-2"
              @click="pick(idea)"
            >
              <UIcon
                :name="idea.pillar ? PILLAR_META[idea.pillar].icon : 'i-lucide-lightbulb'"
                class="size-4 text-muted shrink-0"
              />
              <span class="text-sm line-clamp-2 break-words">{{ idea.title }}</span>
            </button>
          </li>
        </ul>
        <div class="flex flex-col sm:flex-row gap-2 pt-2 border-t border-default">
          <UButton
            icon="i-lucide-lightbulb"
            variant="soft"
            :label="t('planner.pick.newIdea')"
            class="justify-center"
            @click="day && emit('newIdea', day)"
          />
          <UButton
            icon="i-lucide-square-pen"
            variant="ghost"
            color="neutral"
            :label="t('planner.pick.newPost')"
            :to="day ? localePath({ path: '/app/compose', query: { date: day } }) : undefined"
            class="justify-center"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
