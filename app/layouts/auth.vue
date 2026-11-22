<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const isStaff = computed(() => route.path.startsWith('/admin'))
// Creator sign-in pages share the console's "ink rail + paper desk" tokens (main.css); staff pages keep theirs.
useHead({ htmlAttrs: { class: computed(() => isStaff.value ? undefined : 'creator-app') } })
</script>

<template>
  <div
    class="min-h-dvh flex flex-col"
    :class="isStaff ? 'bg-muted' : 'bg-(--app-canvas)'"
  >
    <header class="h-16 px-4 flex items-center justify-between">
      <NuxtLink
        :to="isStaff ? '/admin/auth/login' : localePath('/')"
        class="group flex items-center gap-2 text-lg"
        :class="isStaff ? 'font-bold text-primary' : 'text-highlighted'"
      >
        <BrandMark class="size-8" />
        <span :class="isStaff ? '' : 'app-display'">{{ t('app.name') }}<span
          v-if="isStaff"
          class="text-muted font-medium"
        > · Admin</span></span>
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
