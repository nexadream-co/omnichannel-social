<script setup lang="ts">
/** Clicks per day as plain bars: no chart library, readable on a phone (docs/SCREENS.md #27). Tap or hover a bar for its day. */
const props = defineProps<{ daily: { day: string, clicks: number }[], days: number, today: string }>()
const { t, locale } = useI18n()

const series = computed(() => {
  const byDay = new Map(props.daily.map(d => [d.day, d.clicks]))
  const end = new Date(`${props.today}T12:00:00Z`).getTime()
  return Array.from({ length: props.days }, (_, i) => {
    const d = new Date(end - (props.days - 1 - i) * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    return { key, clicks: byDay.get(key) ?? 0 }
  })
})
const max = computed(() => Math.max(1, ...series.value.map(s => s.clicks)))
const label = (key: string) => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`))
const tip = (s: { key: string, clicks: number }) => t('analytics.barTip', { day: label(s.key), n: s.clicks })
const height = (clicks: number) => `${Math.max(clicks ? 4 : 1, (clicks / max.value) * 100)}%`

// Bars grow from the baseline when they first show and whenever the range changes.
const grown = ref(false)
function grow() {
  grown.value = false
  nextTick(() => requestAnimationFrame(() => {
    grown.value = true
  }))
}
onMounted(grow)
watch(() => [props.days, props.daily], grow)

// Hover on desktop, tap or focus on a phone; tapping anywhere else closes it.
const active = ref<number | null>(null)
</script>

<template>
  <div>
    <div
      class="flex items-end gap-0.5 h-32"
      role="group"
      :aria-label="t('analytics.daily')"
      @pointerleave="active = null"
    >
      <UTooltip
        v-for="(s, i) in series"
        :key="i"
        :text="tip(s)"
        :open="active === i"
        :content="{ side: 'top' }"
        :ui="{ content: 'pointer-events-none' }"
      >
        <button
          type="button"
          class="flex-1 min-w-0 flex flex-col justify-end h-full focus-visible:outline-none"
          :aria-label="tip(s)"
          @pointerenter="active = i"
          @click="active = active === i ? null : i"
          @focus="active = i"
          @blur="active = null"
        >
          <span
            class="block w-full rounded-t-sm bg-primary/80 motion-safe:transition-[height,background-color] motion-safe:duration-300"
            :class="active === i ? 'bg-primary' : ''"
            :style="{ height: grown ? height(s.clicks) : '1%', opacity: s.clicks ? 1 : 0.25 }"
          />
        </button>
      </UTooltip>
    </div>
    <div class="flex justify-between text-xs text-muted mt-1">
      <span>{{ label(series[0]!.key) }}</span>
      <span>{{ label(series[series.length - 1]!.key) }}</span>
    </div>
  </div>
</template>
