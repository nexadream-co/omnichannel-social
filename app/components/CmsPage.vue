<script setup lang="ts">
defineProps<{ page: { title: string, content: string, updatedAt: string } }>()
const { locale } = useI18n()
</script>

<template>
  <UContainer class="max-w-3xl py-12">
    <h1 class="text-3xl font-bold text-highlighted mb-2">
      {{ page.title }}
    </h1>
    <p class="text-sm text-muted mb-8">
      {{ formatDate(page.updatedAt, { locale }) }}
    </p>
    <!-- Sanitized on save (server/core/admin/content.ts) -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      class="prose prose-neutral dark:prose-invert max-w-none"
      v-html="page.content"
    />
    <!-- eslint-enable vue/no-v-html -->
  </UContainer>
</template>
