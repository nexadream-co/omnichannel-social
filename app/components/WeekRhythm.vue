<script setup lang="ts">
import { MAX_POSTS_PER_WEEK } from '#shared/utils/planner'
import { haptic } from '~/utils/haptics'

/**
 * "2/3 terisi minggu ini" with the weekly target picker (Kalender, week view). Reaching the target during this
 * visit (seen as a count that crosses it when a load settles, in the same week) glows once and celebrates.
 */
const props = defineProps<{ count: number, target: number, monday: string, loading: boolean }>()
const { t } = useI18n()
const milestones = useMilestones()
const auth = useCreatorAuth()
const toast = useToast()
const planner = usePlanner()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const reached = computed(() => props.count >= props.target)
const percent = computed(() => Math.min(100, Math.round((props.count / Math.max(1, props.target)) * 100)))
const targetItems = Array.from({ length: MAX_POSTS_PER_WEEK }, (_, i) => ({ value: i + 1, label: t('planner.rhythm.perWeek', { n: i + 1 }) }))

// Animated fill: starts empty and grows to the real value, also when the value changes.
const fill = ref(0)
onMounted(() => requestAnimationFrame(() => {
  fill.value = percent.value
}))
watch(percent, (value) => {
  fill.value = value
})

const glowing = ref(false)
let glowTimer: ReturnType<typeof setTimeout> | undefined
onScopeDispose(() => clearTimeout(glowTimer))
let settled: { monday: string, count: number } | null = null
watch(() => props.loading, async (loading) => {
  if (loading) return
  const before = settled
  settled = { monday: props.monday, count: props.count }
  if (!before || before.monday !== props.monday || before.count >= props.target || props.count < props.target) return
  if (!milestones.reach(`weekTarget:${props.monday}`)) return
  glowing.value = true
  clearTimeout(glowTimer)
  glowTimer = setTimeout(() => {
    glowing.value = false
  }, 900)
  haptic('success')
  let streak = 1
  try {
    streak = (await apiFetch<{ streak: number }>('/api/app/planner/week')).streak
  } catch { /* the toast works without the streak */ }
  toast.add({ title: streak > 1 ? t('planner.rhythm.hitStreak', { n: streak }) : t('planner.rhythm.hit'), color: 'success' })
})

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
  <div
    class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-default bg-default p-3 mb-4"
    :class="glowing ? 'animate-glow' : ''"
  >
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium flex items-center gap-1.5">
        <UIcon
          :name="reached ? 'i-lucide-party-popper' : 'i-lucide-target'"
          class="size-4 shrink-0"
          :class="reached ? 'text-success' : 'text-primary'"
        />
        <template v-if="reached">
          {{ t('planner.rhythm.reached') }}
        </template>
        <i18n-t
          v-else
          keypath="planner.rhythm.progressNode"
          tag="span"
        >
          <template #count>
            <TickNumber :value="count" />
          </template>
          <template #target>
            {{ target }}
          </template>
        </i18n-t>
      </p>
      <UProgress
        :model-value="fill"
        size="sm"
        :color="reached ? 'success' : 'primary'"
        class="mt-2"
        :ui="{ indicator: 'motion-safe:duration-700' }"
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
