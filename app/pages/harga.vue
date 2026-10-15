<script setup lang="ts">
/** Pricing as its own page, for ads and shared links (docs/blueprint/14 §1). */
const { t } = useI18n()
const { data } = await useFetch<{ plans: never[], trialPlanSlug: string, registrationOpen: boolean, company: { name: string } }>('/api/public/landing')
useSeoMeta({ title: () => `${t('landing.pricingTitle')} · ${data.value?.company.name ?? 'Socialz.id'}`, description: () => t('landing.pricingBody') })
</script>

<template>
  <UContainer class="py-14 sm:py-20 space-y-8">
    <div class="text-center space-y-2">
      <h1 class="text-3xl sm:text-4xl font-bold text-highlighted">
        {{ t('landing.pricingTitle') }}
      </h1>
      <p class="text-muted">
        {{ t('landing.pricingBody') }}
      </p>
    </div>
    <LandingPricing
      v-if="data"
      :plans="data.plans"
      :trial-plan-slug="data.trialPlanSlug"
      :registration-open="data.registrationOpen"
    />
  </UContainer>
</template>
