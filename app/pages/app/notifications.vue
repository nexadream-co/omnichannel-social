<script setup lang="ts">
definePageMeta({ layout: 'creator' })
useHead({ title: () => useNuxtApp().$i18n.t('notifications.title') })
</script>

<template>
  <NotificationsPage audience="creator" />
</template>
