<script setup lang="ts">
/** Clicks per day as plain bars: no chart library, readable on a phone (docs/SCREENS.md #27). */
const props = defineProps<{ daily: { day: string, clicks: number }[], days: number, today: string }>()
const { locale } = useI18n()

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
</script>

<template>
  <div>
    <div
      class="flex items-end gap-0.5 h-32"
      role="img"
      :aria-label="series.map(s => `${label(s.key)}: ${s.clicks}`).join(', ')"
    >
      <div
        v-for="s in series"
        :key="s.key"
        class="flex-1 min-w-0 flex flex-col justify-end h-full group relative"
      >
        <div
          class="w-full rounded-t-sm bg-primary/80 group-hover:bg-primary transition-colors"
          :style="{ height: `${Math.max(s.clicks ? 4 : 1, (s.clicks / max) * 100)}%`, opacity: s.clicks ? 1 : 0.25 }"
        />
        <span class="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-inverted text-inverted text-xs px-1.5 py-0.5 opacity-0 group-hover:opacity-100">{{ label(s.key) }} · {{ s.clicks }}</span>
      </div>
    </div>
    <div class="flex justify-between text-xs text-muted mt-1">
      <span>{{ label(series[0]!.key) }}</span>
      <span>{{ label(series[series.length - 1]!.key) }}</span>
    </div>
  </div>
</template>
