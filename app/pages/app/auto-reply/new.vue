<script setup lang="ts">
definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const route = useRoute()
useHead({ title: () => t('autoReply.newTitle') })
</script>

<template>
  <AutoReplyEditor
    :template="typeof route.query.template === 'string' ? route.query.template : undefined"
    :link-id="typeof route.query.link === 'string' ? route.query.link : undefined"
  />
</template>
