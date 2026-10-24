<script setup lang="ts">
import { TransitionPresets, usePreferredReducedMotion, useTransition } from '@vueuse/core'

const props = withDefaults(defineProps<{ value: number, format?: (n: number) => string, duration?: number, showUp?: boolean }>(), { duration: 600 })

const reduced = usePreferredReducedMotion()
const source = ref(props.value)
const shown = useTransition(source, { duration: computed(() => reduced.value === 'reduce' ? 0 : props.duration), transition: TransitionPresets.easeOutCubic })
const text = computed(() => {
  const n = Math.round(shown.value)
  return props.format ? props.format(n) : String(n)
})

const up = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => props.value, (next, prev) => {
  source.value = next
  if (props.showUp && next > prev) {
    up.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      up.value = false
    }, 2000)
  }
})
onScopeDispose(() => clearTimeout(timer))
</script>

<template>
  <span class="tabular-nums inline-flex items-center gap-1">
    <span>{{ text }}</span>
    <UIcon
      v-if="up"
      name="i-lucide-trending-up"
      class="size-4 text-success"
    />
  </span>
</template>
