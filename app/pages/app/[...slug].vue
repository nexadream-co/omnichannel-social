<script setup lang="ts">
// Placeholder for console pages delivered in later milestones (compose, calendar, links…). Keeps the nav honest.
definePageMeta({ layout: 'creator' })

const { t } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('common.comingSoon') })
</script>

<template>
  <div class="max-w-md mx-auto text-center py-16 space-y-4">
    <UIcon
      name="i-lucide-hammer"
      class="size-10 text-muted mx-auto"
    />
    <h1 class="text-xl font-semibold text-highlighted">
      {{ t('common.comingSoon') }}
    </h1>
    <p class="text-muted">
      {{ t('common.comingSoonBody') }}
    </p>
    <UButton
      :to="localePath('/app')"
      :label="t('common.backToHome')"
    />
  </div>
</template>
