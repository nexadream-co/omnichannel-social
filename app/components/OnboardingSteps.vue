<script setup lang="ts">
import { ONBOARDING_STEPS } from '#shared/utils/onboarding'
import type { CreatorProfile } from '~/composables/useCreatorAuth'

const props = defineProps<{ onboarding: CreatorProfile['onboarding'], compact?: boolean }>()
const { t } = useI18n()
const localePath = useLocalePath()

const steps = computed(() => ONBOARDING_STEPS.map(step => ({ ...step, done: Boolean(props.onboarding[step.key]) })))
const nextKey = computed(() => steps.value.find(step => !step.done)?.key)
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="(step, index) in steps"
      :key="step.key"
    >
      <NuxtLink
        :to="localePath(step.to)"
        class="flex w-full items-center gap-3 rounded-lg border border-default px-3 text-left motion-safe:transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
        :class="[compact ? 'py-2' : 'py-3', step.key === nextKey ? 'ring-2 ring-primary' : '']"
      >
        <span
          class="grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold"
          :class="step.done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'"
        >
          <UIcon
            v-if="step.done"
            name="i-lucide-check"
            class="size-4"
          />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="min-w-0 flex-1">
          <span
            class="block text-sm font-medium"
            :class="step.done ? 'text-muted line-through' : 'text-highlighted'"
          >{{ t(step.titleKey) }}</span>
          <span
            v-if="!compact && !step.done"
            class="block text-xs text-muted"
          >{{ t(step.bodyKey) }}</span>
        </span>
        <UIcon
          v-if="!step.done"
          name="i-lucide-chevron-right"
          class="size-4 shrink-0 text-muted"
        />
      </NuxtLink>
    </li>
  </ul>
</template>
