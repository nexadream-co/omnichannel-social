<script setup lang="ts">
import { PILLAR_META, type IdeaDetail } from '#shared/utils/planner'

/**
 * Tap on a Kalender day: create something on that date. A post (the composer opens on that day), a new idea, or,
 * when Bank Ide has undated ideas (`waiting`), one of those.
 */
const props = defineProps<{ day: string | null, waiting: number }>()
const emit = defineEmits<{ close: [], newIdea: [day: string] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const planner = usePlanner()

const open = computed({ get: () => Boolean(props.day), set: value => !value && emit('close') })
const ideas = shallowRef<IdeaDetail[]>([])
const loading = ref(false)
watch(() => props.day, async (day) => {
  if (!day || props.waiting < 1) {
    ideas.value = []
    return
  }
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
  <ResponsiveSheet
    v-model:open="open"
    :title="day ? t('planner.pick.title', { date: planner.dayLabel(day) }) : ''"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid sm:grid-cols-2 gap-2">
          <UButton
            icon="i-lucide-square-pen"
            size="lg"
            :label="t('planner.pick.newPost')"
            :to="day ? localePath({ path: '/app/compose', query: { date: day } }) : undefined"
            class="justify-center"
          />
          <UButton
            icon="i-lucide-lightbulb"
            size="lg"
            variant="soft"
            :label="t('planner.pick.newIdea')"
            class="justify-center"
            @click="day && emit('newIdea', day)"
          />
        </div>
        <div
          v-if="waiting > 0"
          class="pt-3 border-t border-default space-y-2"
        >
          <p class="text-sm text-muted">
            {{ t('planner.pick.fromBank') }}
          </p>
          <div
            v-if="loading"
            class="space-y-2"
          >
            <USkeleton
              v-for="n in Math.min(waiting, 3)"
              :key="n"
              class="h-11 w-full"
            />
          </div>
          <ul
            v-else
            class="space-y-2 max-h-72 overflow-y-auto"
          >
            <li
              v-for="idea in ideas"
              :key="idea.id"
            >
              <button
                type="button"
                class="w-full text-left rounded-md border border-dashed border-accented px-3 py-2.5 hover:bg-elevated hover:border-primary/50 motion-safe:transition-colors flex items-center gap-2"
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
        </div>
      </div>
    </template>
  </ResponsiveSheet>
</template>
