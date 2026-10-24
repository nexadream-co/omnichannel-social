<script setup lang="ts">
/** A small SVG ring that fills with `value` (0 to 100). The colour follows the text colour of the parent. */
const props = withDefaults(defineProps<{ value: number, size?: number, stroke?: number, label?: string }>(), { size: 16, stroke: 2.5 })

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => circumference.value * (1 - Math.min(100, Math.max(0, props.value)) / 100))
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="`0 0 ${size} ${size}`"
    class="shrink-0 -rotate-90"
    role="img"
    :aria-label="label"
    :aria-hidden="label ? undefined : true"
  >
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke"
      class="opacity-20"
    />
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      stroke="currentColor"
      :stroke-width="stroke"
      stroke-linecap="round"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="offset"
      class="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-200"
    />
  </svg>
</template>
