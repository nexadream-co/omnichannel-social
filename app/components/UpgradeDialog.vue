<script setup lang="ts">
import { FEATURE_META } from '#shared/utils/plans'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const entitlements = useEntitlements()
const state = entitlements.upgradeDialog
const open = computed({
  get: () => state.value.open,
  set: (value: boolean) => {
    state.value = { ...state.value, open: value }
  }
})
const canBuy = computed(() => auth.hasAbility('billing.manage'))
const featureLabel = computed(() => state.value.feature ? FEATURE_META[state.value.feature]?.label : null)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('upgrade.title')"
  >
    <template #body>
      <div class="space-y-3">
        <UIcon
          name="i-lucide-sparkles"
          class="size-8 text-primary"
        />
        <p class="text-default">
          {{ state.message || (featureLabel ? t('upgrade.feature', { feature: featureLabel }) : t('upgrade.generic')) }}
        </p>
        <p class="text-sm text-muted">
          {{ canBuy ? t('upgrade.reassure') : t('upgrade.askOwner') }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('upgrade.later')"
          @click="open = false"
        />
        <UButton
          v-if="canBuy"
          :to="localePath('/app/billing')"
          :label="t('upgrade.seePlans')"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
