<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-3 mb-6">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold text-highlighted">
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
