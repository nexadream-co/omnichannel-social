<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const isStaff = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-muted">
    <header class="h-16 px-4 flex items-center justify-between">
      <NuxtLink
        :to="isStaff ? '/admin/auth/login' : localePath('/')"
        class="font-bold text-lg text-primary"
      >
        {{ t('app.name') }}<span
          v-if="isStaff"
          class="text-muted font-medium"
        > · Admin</span>
      </NuxtLink>
      <div class="flex items-center gap-1">
        <LocaleSwitch v-if="!isStaff" />
        <UColorModeButton />
      </div>
    </header>
    <main class="flex-1 flex items-start sm:items-center justify-center px-4 pb-12 pt-4">
      <div class="w-full max-w-md">
        <AuthArt v-if="!isStaff" />
        <slot />
      </div>
    </main>
  </div>
</template>
