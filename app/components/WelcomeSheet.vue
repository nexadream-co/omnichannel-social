<script setup lang="ts">
import { ONBOARDING_STEPS } from '#shared/utils/onboarding'
import type { CreatorProfile } from '~/composables/useCreatorAuth'

/** Shown once after registering (/app?welcome=1): what is left to do, and the one button to start. */
const props = defineProps<{ name: string, onboarding: CreatorProfile['onboarding'] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const localePath = useLocalePath()

const remaining = computed(() => ONBOARDING_STEPS.filter(step => !props.onboarding[step.key]))
const next = computed(() => remaining.value[0])
const startLabel = computed(() => next.value?.key === 'accountConnected' ? t('home.welcome.start') : t('home.welcome.continue'))

async function start() {
  open.value = false
  if (next.value) await navigateTo(localePath(next.value.to))
}
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="remaining.length ? t('home.welcome.title', { name, n: remaining.length }) : t('home.welcome.titleDone', { name })"
    :description="t('home.welcome.body')"
  >
    <template #body>
      <OnboardingSteps
        :onboarding="onboarding"
        compact
      />
    </template>
    <template #footer>
      <div class="flex w-full flex-col gap-2 sm:flex-row-reverse">
        <UButton
          v-if="next"
          size="lg"
          class="justify-center sm:flex-1"
          :label="startLabel"
          @click="start"
        />
        <UButton
          color="neutral"
          variant="ghost"
          class="justify-center"
          :label="t('home.welcome.later')"
          @click="open = false"
        />
      </div>
    </template>
  </ResponsiveSheet>
</template>
