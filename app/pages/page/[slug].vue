<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data: page, error } = await useFetch(() => `/api/public/pages/${slug.value}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, fatal: true })
useSeoMeta({ title: () => page.value?.metaTitle || page.value?.title, description: () => page.value?.metaDescription || undefined })
</script>

<template>
  <UContainer
    v-if="page"
    class="max-w-3xl py-12"
  >
    <h1 class="text-3xl font-bold text-highlighted mb-6">
      {{ page.title }}
    </h1>
    <!-- Sanitized HTML from the admin rich-text editor (docs/blueprint/14) -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      class="prose dark:prose-invert max-w-none"
      v-html="page.content"
    />
    <!-- eslint-enable vue/no-v-html -->
  </UContainer>
</template>
