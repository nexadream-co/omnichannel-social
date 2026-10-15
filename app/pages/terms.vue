<script setup lang="ts">
/** /terms renders the CMS page row with that slug (required for Meta App Review). */
const { data: page, error } = await useFetch<{ title: string, content: string, metaTitle: string | null, metaDescription: string | null, updatedAt: string }>('/api/public/pages/terms')
if (error.value) throw createError({ statusCode: 404, fatal: true })
useSeoMeta({ title: () => page.value?.metaTitle || page.value?.title, description: () => page.value?.metaDescription || undefined })
</script>

<template>
  <CmsPage
    v-if="page"
    :page="page"
  />
</template>
