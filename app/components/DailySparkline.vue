<script setup lang="ts">
/** Seven small bars, oldest first. Pure CSS, so it prints fine in a card or a row. */
const props = defineProps<{ values: number[], label: string }>()
const max = computed(() => Math.max(1, ...props.values))
const bars = computed(() => props.values.map(value => ({ value, height: value ? Math.max(14, Math.round((value / max.value) * 100)) : 8 })))
</script>

<template>
  <div
    class="flex h-6 items-end gap-0.5"
    role="img"
    :aria-label="label"
  >
    <span
      v-for="(bar, index) in bars"
      :key="index"
      class="w-1.5 rounded-sm"
      :class="bar.value ? 'bg-primary' : 'bg-accented'"
      :style="{ height: `${bar.height}%` }"
    />
  </div>
</template>
