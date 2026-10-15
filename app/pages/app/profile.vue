<script setup lang="ts">
definePageMeta({ layout: 'creator' })
const { t } = useI18n()
useHead({ title: () => t('profile.title') })
</script>

<template>
  <div class="w-full max-w-2xl mx-auto">
    <CommandBar
      :title="t('profile.title')"
      :description="t('profile.subtitle')"
    />
    <ProfileForm audience="creator" />
  </div>
</template>
