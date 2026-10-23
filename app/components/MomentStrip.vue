<script setup lang="ts">
import { daysBetween, MOMENT_KIND_META, momentName, type PlannerMoment } from '#shared/utils/planner'

/** "Momen belanja" coming up or happening now, each with "Siapkan konten" (three dated ideas). */
const props = defineProps<{ moments: PlannerMoment[], today: string }>()
const { t, locale } = useI18n()
const auth = useCreatorAuth()
const toast = useToast()
const planner = usePlanner()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const visible = computed(() => props.moments.filter(m => m.endsOn >= props.today).slice(0, 4))
const preparing = ref<string | null>(null)

function when(moment: PlannerMoment) {
  if (moment.startsOn > props.today) return t('planner.moments.inDays', { n: daysBetween(props.today, moment.startsOn) })
  return moment.startsOn === props.today ? t('planner.moments.today') : t('planner.moments.ongoing')
}
function range(moment: PlannerMoment) {
  const start = planner.dayLabel(moment.startsOn)
  return moment.endsOn === moment.startsOn ? start : `${start} – ${planner.dayLabel(moment.endsOn)}`
}

async function prepare(moment: PlannerMoment) {
  preparing.value = moment.id
  try {
    await apiFetch(`/api/app/planner/moments/${moment.id}/prepare`, { method: 'POST', body: { locale: locale.value === 'en' ? 'en' : 'id' } })
    toast.add({ title: t('planner.moments.preparedToast', { name: momentName(moment, locale.value) }), color: 'success' })
  } catch (caught) {
    planner.fail(caught)
  } finally {
    preparing.value = null
  }
}
</script>

<template>
  <section
    v-if="visible.length"
    class="mb-4"
  >
    <div class="flex items-baseline justify-between gap-2 mb-2">
      <h2 class="text-sm font-semibold text-highlighted">
        {{ t('planner.moments.title') }}
      </h2>
      <p class="text-xs text-muted hidden sm:block truncate">
        {{ t('planner.moments.hint') }}
      </p>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
      <div
        v-for="moment in visible"
        :key="moment.id"
        class="snap-start shrink-0 w-60 rounded-md border border-default bg-elevated/50 p-3 flex flex-col gap-2"
      >
        <div class="flex items-start gap-2">
          <UIcon
            :name="MOMENT_KIND_META[moment.kind].icon"
            class="size-5 text-primary shrink-0 mt-0.5"
          />
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ momentName(moment, locale) }}
            </p>
            <p class="text-xs text-muted truncate">
              {{ range(moment) }} · {{ when(moment) }}
            </p>
          </div>
        </div>
        <UBadge
          v-if="moment.prepared"
          color="success"
          variant="subtle"
          icon="i-lucide-check"
          :label="t('planner.moments.prepared')"
          class="self-start"
        />
        <UButton
          v-else-if="canWrite"
          size="xs"
          variant="soft"
          icon="i-lucide-sparkles"
          :label="t('planner.moments.prepare')"
          :loading="preparing === moment.id"
          class="self-start"
          @click="prepare(moment)"
        />
      </div>
    </div>
  </section>
</template>
