<script setup lang="ts">
/** Pricing as its own page, for ads and shared links (docs/blueprint/14 §1). */
const { t } = useI18n()
const { data } = await useFetch<{ plans: { slug: string, name: string }[], faqs: { id: string, question: string, answer: string }[], trialPlanSlug: string, registrationOpen: boolean, company: { name: string } }>('/api/public/landing')
useSeoMeta({ title: () => `${t('landing.pricingTitle')} · ${data.value?.company.name ?? 'Socialz.id'}`, description: () => t('landing.pricingBody') })

const FIT_SLUGS = ['gratis', 'kreator', 'pro'] as const
const fit = computed(() => FIT_SLUGS.map(slug => ({ slug, name: data.value?.plans.find(p => p.slug === slug)?.name ?? t(`landing.fit.${slug}.name`), text: t(`landing.fit.${slug}.text`) })))
const faqItems = computed(() => (data.value?.faqs ?? []).map(f => ({ label: f.question, content: f.answer, value: f.id })))
</script>

<template>
  <UContainer class="py-14 sm:py-20 space-y-12">
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
      :plans="(data.plans as never[])"
      :trial-plan-slug="data.trialPlanSlug"
      :registration-open="data.registrationOpen"
    />

    <section class="mx-auto max-w-3xl space-y-4">
      <h2 class="text-xl sm:text-2xl font-bold text-highlighted text-center">
        {{ t('landing.fit.title') }}
      </h2>
      <ul class="divide-y divide-default rounded-xl border border-default bg-default">
        <li
          v-for="row in fit"
          :key="row.slug"
          class="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-4"
        >
          <span class="font-semibold text-highlighted sm:w-28 shrink-0">{{ row.name }}</span>
          <span class="text-muted">{{ row.text }}</span>
        </li>
      </ul>
    </section>

    <section
      v-if="faqItems.length"
      class="mx-auto max-w-3xl space-y-4"
    >
      <h2 class="text-xl sm:text-2xl font-bold text-highlighted text-center">
        {{ t('landing.faqTitle') }}
      </h2>
      <UAccordion
        :items="faqItems"
        type="multiple"
        :ui="{ trigger: 'text-base font-medium', body: 'text-muted whitespace-pre-line' }"
      />
    </section>
  </UContainer>
</template>
