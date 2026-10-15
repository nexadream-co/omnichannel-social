<script setup lang="ts">
definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const route = useRoute()
useHead({ title: () => t('autoReply.editTitle') })
</script>

<template>
  <AutoReplyEditor :rule-id="String(route.params.id)" />
</template>
