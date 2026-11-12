<script setup lang="ts">
import { deltaPercent } from '#shared/utils/analytics'

// Change against the period before; renders nothing when there is nothing to compare with.
const props = defineProps<{ now: number, previous: number | null, days?: number }>()
const { t } = useI18n()
const delta = computed(() => deltaPercent(props.now, props.previous))
const days = computed(() => props.days ?? 0)
const view = computed(() => {
  const d = delta.value
  if (d === null) return null
  if (d === 'new') return { text: t('analytics.trendNew'), cls: 'text-success', label: t('analytics.trend.new') }
  if (d > 0) return { text: `▲ ${d}%`, cls: 'text-success', label: t('analytics.trend.up', { n: d, days: days.value }) }
  if (d < 0) return { text: `▼ ${Math.abs(d)}%`, cls: 'text-error', label: t('analytics.trend.down', { n: Math.abs(d), days: days.value }) }
  return { text: '0%', cls: 'text-muted', label: t('analytics.trend.same', { days: days.value }) }
})
</script>

<template>
  <p
    v-if="view"
    class="text-xs font-medium"
    :class="view.cls"
    :aria-label="view.label"
    role="img"
  >
    {{ view.text }}
  </p>
</template>
