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

// The trial line can be closed until its last 3 days; then it comes back and stays (so does the grace line).
// A cookie, not localStorage, so the server render already leaves it out and nothing flashes.
const REMIND_DAYS = 3
const hiddenFor = useCookie<string | null>('socialz-trial-banner', { maxAge: 60 * 60 * 24 * 60, sameSite: 'lax' })
const workspaceId = computed(() => auth.workspace.value?.id ?? null)
const closable = computed(() => Boolean(data.value?.isTrialing && (data.value.trialDaysRemaining ?? 0) > REMIND_DAYS))
const visible = computed(() => Boolean(message.value) && !(closable.value && hiddenFor.value && hiddenFor.value === workspaceId.value))
function close() {
  hiddenFor.value = workspaceId.value
}
</script>

<template>
  <Transition name="banner">
    <div
      v-if="visible"
      class="border-b border-default bg-elevated/50 px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2"
    >
      <span class="flex items-center gap-2 text-default">
        <UIcon
          :name="data?.isInGrace ? 'i-lucide-alert-triangle' : 'i-lucide-sparkles'"
          :class="data?.isInGrace ? 'text-warning' : 'text-primary'"
        />
        {{ message }}
      </span>
      <span class="ms-auto flex items-center gap-1">
        <ULink
          v-if="canBuy"
          :to="localePath('/app/billing')"
          class="text-primary font-medium"
        >
          {{ data?.isInGrace ? t('trialBanner.pay') : t('trialBanner.choose') }}
        </ULink>
        <UButton
          v-if="closable"
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          square
          class="-me-1.5"
          :aria-label="t('trialBanner.close')"
          @click="close"
        />
      </span>
    </div>
  </Transition>
</template>
