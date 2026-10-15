<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data: page, error } = await useFetch<{ title: string, content: string, metaTitle: string | null, metaDescription: string | null, updatedAt: string }>(() => `/api/public/pages/${slug.value}`)
if (error.value) throw createError({ statusCode: 404, fatal: true })
useSeoMeta({ title: () => page.value?.metaTitle || page.value?.title, description: () => page.value?.metaDescription || undefined })
</script>

<template>
  <CmsPage
    v-if="page"
    :page="page"
  />
</template>
