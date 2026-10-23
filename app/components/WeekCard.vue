<script setup lang="ts">
import { daysBetween, MOMENT_KIND_META, momentName, type PlannerMoment } from '#shared/utils/planner'

/** Beranda "Minggu ini": how full this week is, ideas waiting in Bank Ide and the next shopping moment. */
interface WeekSummary { weekStart: string, today: string, count: number, target: number, unplannedIdeas: number, nextMoment: PlannerMoment | null }

const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const planner = usePlanner()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const week = ref<WeekSummary | null>(null)
async function load() {
  week.value = await apiFetch<WeekSummary>('/api/app/planner/week').catch(() => null)
}
onMounted(load)

const percent = computed(() => week.value ? Math.min(100, Math.round((week.value.count / Math.max(1, week.value.target)) * 100)) : 0)
const reached = computed(() => Boolean(week.value && week.value.count >= week.value.target))
const momentWhen = computed(() => {
  const w = week.value
  if (!w?.nextMoment) return ''
  return w.nextMoment.startsOn > w.today ? t('planner.moments.inDays', { n: daysBetween(w.today, w.nextMoment.startsOn) }) : t('planner.moments.ongoing')
})

const preparing = ref(false)
async function prepare() {
  if (!week.value?.nextMoment) return
  preparing.value = true
  if (await planner.prepareMoment(week.value.nextMoment)) await load()
  preparing.value = false
}
</script>

<template>
  <UCard v-if="week">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-semibold text-highlighted">
          {{ t('home.week.title') }}
        </h2>
        <ULink
          :to="localePath('/app/calendar')"
          class="text-sm text-primary"
        >
          {{ t('home.week.open') }}
        </ULink>
      </div>
    </template>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium flex items-center gap-1.5">
          <UIcon
            :name="reached ? 'i-lucide-party-popper' : 'i-lucide-target'"
            class="size-4 shrink-0"
            :class="reached ? 'text-success' : 'text-primary'"
          />
          {{ reached ? t('planner.rhythm.reached') : t('planner.rhythm.progress', { count: week.count, target: week.target }) }}
        </p>
        <UProgress
          :model-value="percent"
          size="sm"
          :color="reached ? 'success' : 'primary'"
          class="mt-2"
        />
        <p
          v-if="week.unplannedIdeas"
          class="text-sm text-muted mt-2"
        >
          {{ t('home.week.ideasWaiting', { n: week.unplannedIdeas }) }}
        </p>
      </div>
      <div
        v-if="week.nextMoment"
        class="flex items-center gap-3 rounded-md border border-default p-3"
      >
        <UIcon
          :name="MOMENT_KIND_META[week.nextMoment.kind].icon"
          class="size-5 text-primary shrink-0"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-highlighted truncate">
            {{ momentName(week.nextMoment, locale) }}
          </p>
          <p class="text-xs text-muted">
            {{ momentWhen }}
          </p>
        </div>
        <UBadge
          v-if="week.nextMoment.prepared"
          color="success"
          variant="subtle"
          icon="i-lucide-check"
          :label="t('planner.moments.prepared')"
        />
        <UButton
          v-else-if="canWrite"
          size="xs"
          variant="soft"
          icon="i-lucide-sparkles"
          :label="t('planner.moments.prepare')"
          :loading="preparing"
          @click="prepare"
        />
      </div>
    </div>
  </UCard>
</template>
