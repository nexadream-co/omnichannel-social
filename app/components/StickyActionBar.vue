<script setup lang="ts">
// While a bar is mounted the phone bottom nav hides (focus mode), so the bar owns the bottom edge.
const bars = useState<number>('shell:actionBars', () => 0)
onMounted(() => {
  bars.value++
})
onBeforeUnmount(() => {
  bars.value = Math.max(0, bars.value - 1)
})
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-default bg-default/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:sticky lg:inset-x-auto lg:mt-6 lg:rounded-lg lg:border lg:pb-3">
    <div class="min-w-0 text-sm text-muted">
      <slot name="leading" />
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <slot />
    </div>
  </div>
</template>
