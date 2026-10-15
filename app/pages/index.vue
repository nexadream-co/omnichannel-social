<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
useSeoMeta({ title: () => `${t('app.name')} · ${t('landing.heroTitle')}`, description: () => t('landing.heroBody') })

const features = [
  { icon: 'i-lucide-calendar-clock', title: 'landing.feature1Title', body: 'landing.feature1Body' },
  { icon: 'i-lucide-store', title: 'landing.feature2Title', body: 'landing.feature2Body' },
  { icon: 'i-lucide-message-circle-reply', title: 'landing.feature3Title', body: 'landing.feature3Body' }
]
</script>

<template>
  <div>
    <section class="py-16 sm:py-24">
      <UContainer class="max-w-3xl text-center space-y-6">
        <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-highlighted">
          {{ t('landing.heroTitle') }}
        </h1>
        <p class="text-lg text-muted">
          {{ t('landing.heroBody') }}
        </p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <UButton
            :to="localePath('/app/auth/register')"
            size="xl"
            :label="t('landing.ctaRegister')"
            trailing-icon="i-lucide-arrow-right"
          />
          <UButton
            :to="localePath('/app/auth/login')"
            size="xl"
            color="neutral"
            variant="outline"
            :label="t('landing.ctaLogin')"
          />
        </div>
      </UContainer>
    </section>
    <section class="pb-24">
      <UContainer class="grid gap-6 sm:grid-cols-3">
        <UCard
          v-for="feature in features"
          :key="feature.title"
        >
          <UIcon
            :name="feature.icon"
            class="size-8 text-primary"
          />
          <h2 class="mt-4 font-semibold text-highlighted">
            {{ t(feature.title) }}
          </h2>
          <p class="mt-2 text-sm text-muted">
            {{ t(feature.body) }}
          </p>
        </UCard>
      </UContainer>
    </section>
  </div>
</template>
