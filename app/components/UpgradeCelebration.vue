<script setup lang="ts">
import { FEATURE_META, type FeatureKey } from '#shared/utils/plans'

/** Shown once after the first paid upgrade: confetti plus the features that just opened. */
defineProps<{ planName: string, features: FeatureKey[] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const { confetti } = useCelebrate()

watch(open, (value) => {
  if (value) void confetti({ big: true })
})
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="t('billing.celebrate.title', { plan: planName })"
    :description="t('billing.celebrate.body')"
  >
    <template #body>
      <ul
        v-if="features.length"
        class="space-y-2"
      >
        <li
          v-for="feature in features"
          :key="feature"
          class="flex items-start gap-2 text-sm"
        >
          <UIcon
            name="i-lucide-check"
            class="size-4 text-success shrink-0 mt-0.5"
          />
          <span class="text-default">{{ FEATURE_META[feature].label }}</span>
        </li>
      </ul>
    </template>
    <template #footer>
      <UButton
        block
        :label="t('billing.celebrate.cta')"
        @click="open = false"
      />
    </template>
  </ResponsiveSheet>
</template>
