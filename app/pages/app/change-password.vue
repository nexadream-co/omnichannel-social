<script setup lang="ts">
definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const auth = useCreatorAuth()
const title = computed(() => auth.profile.value?.user.hasPassword === false ? t('password.createTitle') : t('password.title'))
useHead({ title })
</script>

<template>
  <div class="w-full max-w-2xl mx-auto">
    <CommandBar :title="title" />
    <ChangePasswordForm audience="creator" />
  </div>
</template>
