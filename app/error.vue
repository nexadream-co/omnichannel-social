<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
const localePath = useLocalePath()

const title = computed(() => props.error.statusCode === 404 ? t('error.notFoundTitle') : t('error.genericTitle'))
</script>

<template>
  <UApp>
    <main class="min-h-dvh flex items-center justify-center bg-default p-6">
      <div class="max-w-md text-center space-y-4">
        <p class="text-sm text-muted">
          {{ error.statusCode }}
        </p>
        <h1 class="text-2xl font-semibold text-highlighted">
          {{ title }}
        </h1>
        <p class="text-muted">
          {{ error.statusCode === 404 ? t('error.notFoundBody') : t('error.genericBody') }}
        </p>
        <UButton
          :to="localePath('/')"
          :label="t('error.backHome')"
          @click="clearError({ redirect: localePath('/') })"
        />
      </div>
    </main>
  </UApp>
</template>
