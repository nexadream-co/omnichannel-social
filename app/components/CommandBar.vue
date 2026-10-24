<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

// `compact`: a smaller heading for pages that lead with a big card of their own (the billing header).
const props = defineProps<{ title: string, description?: string, compact?: boolean }>()

// The phone navbar shows the title once this heading scrolls out of view (CreatorShell reads shell:pageTitle).
const pageTitle = useState<{ title: string, visible: boolean }>('shell:pageTitle', () => ({ title: '', visible: true }))
const heading = ref<HTMLElement | null>(null)

useIntersectionObserver(heading, ([entry]) => {
  pageTitle.value = { title: props.title, visible: entry?.isIntersecting ?? true }
})
onBeforeUnmount(() => {
  pageTitle.value = { title: '', visible: true }
})
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-3 mb-6">
    <div class="min-w-0">
      <h1
        ref="heading"
        class="font-semibold text-highlighted"
        :class="compact ? 'text-xl' : 'text-2xl'"
      >
        {{ title }}
      </h1>
      <p
        v-if="description"
        class="text-muted mt-1"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.default"
      class="flex flex-wrap gap-2 w-full sm:w-auto"
    >
      <slot />
    </div>
  </div>
</template>
