<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-default">
    <header class="border-b border-default">
      <UContainer class="h-16 flex items-center justify-between gap-4">
        <NuxtLink
          :to="localePath('/')"
          class="font-bold text-lg text-primary"
        >
          {{ t('app.name') }}
        </NuxtLink>
        <div class="flex items-center gap-2">
          <LocaleSwitch />
          <UColorModeButton />
          <UButton
            :to="localePath('/app/auth/login')"
            variant="ghost"
            color="neutral"
            :label="t('landing.ctaLogin')"
          />
          <UButton
            :to="localePath('/app/auth/register')"
            :label="t('landing.ctaRegister')"
            class="hidden sm:inline-flex"
          />
        </div>
      </UContainer>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-default py-6 text-sm text-muted">
      <UContainer class="flex flex-wrap gap-4 justify-between">
        <span>© {{ new Date().getFullYear() }} {{ t('app.name') }}</span>
        <span class="flex gap-4">
          <NuxtLink
            :to="localePath('/page/terms')"
            class="hover:text-default"
          >{{ t('auth.terms') }}</NuxtLink>
          <NuxtLink
            :to="localePath('/page/privacy')"
            class="hover:text-default"
          >{{ t('auth.privacy') }}</NuxtLink>
        </span>
      </UContainer>
    </footer>
  </div>
</template>
