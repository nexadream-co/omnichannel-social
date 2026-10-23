<script setup lang="ts">
import { MAX_POSTS_PER_WEEK } from '#shared/utils/planner'

/** "2/3 terisi minggu ini" with the weekly target picker (Kalender, week view). */
const props = defineProps<{ count: number, target: number }>()
const { t } = useI18n()
const auth = useCreatorAuth()
const toast = useToast()
const planner = usePlanner()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const reached = computed(() => props.count >= props.target)
const percent = computed(() => Math.min(100, Math.round((props.count / Math.max(1, props.target)) * 100)))
const targetItems = Array.from({ length: MAX_POSTS_PER_WEEK }, (_, i) => ({ value: i + 1, label: t('planner.rhythm.perWeek', { n: i + 1 }) }))

async function setTarget(value: number) {
  try {
    await apiFetch('/api/app/planner/rhythm', { method: 'PATCH', body: { postsPerWeek: value } })
    toast.add({ title: t('planner.rhythm.saved'), color: 'success' })
  } catch (caught) {
    planner.fail(caught)
  }
}
</script>

<template>
  <div class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-default bg-default p-3 mb-4">
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium flex items-center gap-1.5">
        <UIcon
          :name="reached ? 'i-lucide-party-popper' : 'i-lucide-target'"
          class="size-4 shrink-0"
          :class="reached ? 'text-success' : 'text-primary'"
        />
        {{ reached ? t('planner.rhythm.reached') : t('planner.rhythm.progress', { count, target }) }}
      </p>
      <UProgress
        :model-value="percent"
        size="sm"
        :color="reached ? 'success' : 'primary'"
        class="mt-2"
      />
    </div>
    <UFormField
      v-if="canWrite"
      :label="t('planner.rhythm.target')"
      class="sm:w-44"
    >
      <USelect
        :model-value="target"
        :items="targetItems"
        size="sm"
        class="w-full"
        @update:model-value="setTarget"
      />
    </UFormField>
  </div>
</template>
