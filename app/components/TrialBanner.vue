<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const entitlements = useEntitlements()
const data = computed(() => entitlements.data.value)
const canBuy = computed(() => auth.hasAbility('billing.manage'))

// Quiet, never a pop-up (docs/blueprint/06 §9).
const message = computed(() => {
  const e = data.value
  if (!e) return null
  if (e.isTrialing && e.trialDaysRemaining !== null) return t('trialBanner.trial', { plan: e.planName, days: e.trialDaysRemaining })
  if (e.isInGrace && e.graceEndsAt) return t('trialBanner.grace', { date: formatDate(e.graceEndsAt, { locale: locale.value }) })
  return null
})
</script>

<template>
  <div
    v-if="message"
    class="border-b border-default bg-elevated/50 px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2"
  >
    <span class="flex items-center gap-2 text-default">
      <UIcon
        :name="data?.isInGrace ? 'i-lucide-alert-triangle' : 'i-lucide-sparkles'"
        :class="data?.isInGrace ? 'text-warning' : 'text-primary'"
      />
      {{ message }}
    </span>
    <ULink
      v-if="canBuy"
      :to="localePath('/app/billing')"
      class="text-primary font-medium"
    >
      {{ data?.isInGrace ? t('trialBanner.pay') : t('trialBanner.choose') }}
    </ULink>
  </div>
</template>
