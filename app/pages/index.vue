<script setup lang="ts">
interface Landing {
  plans: { slug: string, name: string, description: string | null, priceMonthly: number, priceYearly: number, trialDays: number, limits: Record<string, number>, features: Record<string, boolean> }[]
  faqs: { id: string, question: string, answer: string, category: string }[]
  company: { name: string, tagline: string, email: string, whatsapp: string, instagram: string, threads: string, tiktok: string, youtube: string }
  trialPlanSlug: string
  registrationOpen: boolean
}

const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { data } = await useFetch<Landing>('/api/public/landing')

useSeoMeta({
  title: () => `${data.value?.company.name ?? 'Socialz.id'} · ${t('landing.heroTitle')}`,
  description: () => data.value?.company.tagline || t('landing.heroBody'),
  ogTitle: () => t('landing.heroTitle'),
  ogDescription: () => t('landing.heroBody'),
  ogType: 'website',
  twitterCard: 'summary_large_image'
})
// Organization + SoftwareApplication (docs/blueprint/14 §6).
useHead(() => ({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify([
      { '@context': 'https://schema.org', '@type': 'Organization', 'name': data.value?.company.name ?? 'Socialz.id', 'url': config.public.siteUrl, 'email': data.value?.company.email || undefined },
      {
        '@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': data.value?.company.name ?? 'Socialz.id', 'applicationCategory': 'BusinessApplication', 'operatingSystem': 'Web',
        'offers': (data.value?.plans ?? []).map(p => ({ '@type': 'Offer', 'name': p.name, 'price': p.priceMonthly, 'priceCurrency': 'IDR' }))
      }
    ])
  }]
}))

const features = [
  { icon: 'i-lucide-calendar-clock', title: 'landing.feature1Title', body: 'landing.feature1Body' },
  { icon: 'i-lucide-store', title: 'landing.feature2Title', body: 'landing.feature2Body' },
  { icon: 'i-lucide-message-circle-reply', title: 'landing.feature3Title', body: 'landing.feature3Body' }
]
const steps = [
  { icon: 'i-simple-icons-instagram', title: 'landing.step1Title', body: 'landing.step1Body' },
  { icon: 'i-lucide-link', title: 'landing.step2Title', body: 'landing.step2Body' },
  { icon: 'i-lucide-calendar-check', title: 'landing.step3Title', body: 'landing.step3Body' }
]
const platforms = [
  { name: 'Instagram', icon: 'i-simple-icons-instagram', live: true },
  { name: 'Threads', icon: 'i-simple-icons-threads', live: true },
  { name: 'Facebook', icon: 'i-simple-icons-facebook', live: true },
  { name: 'TikTok', icon: 'i-simple-icons-tiktok', live: false },
  { name: 'YouTube', icon: 'i-simple-icons-youtube', live: false },
  { name: 'X', icon: 'i-simple-icons-x', live: false }
]
const faqItems = computed(() => (data.value?.faqs ?? []).map(f => ({ label: f.question, content: f.answer, value: f.id })))
const whatsappUrl = computed(() => data.value?.company.whatsapp ? `https://wa.me/${data.value.company.whatsapp.replace(/\D/g, '')}` : null)
</script>

<template>
  <div>
    <!-- Hero -->
    <section
      id="beranda"
      class="scroll-mt-20 overflow-hidden"
    >
      <UContainer class="grid gap-12 lg:grid-cols-[1.1fr_1fr] items-center py-14 sm:py-20">
        <div class="space-y-6 text-center lg:text-left">
          <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-highlighted text-balance">
            {{ t('landing.heroTitle') }}
          </h1>
          <p class="text-lg text-muted text-pretty">
            {{ t('landing.heroBody') }}
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <UButton
              v-if="data?.registrationOpen !== false"
              :to="localePath('/app/auth/register')"
              size="xl"
              class="justify-center"
              :label="t('landing.ctaRegister')"
              trailing-icon="i-lucide-arrow-right"
            />
            <UButton
              v-else
              size="xl"
              class="justify-center"
              color="neutral"
              variant="soft"
              disabled
              :label="t('landing.ctaClosed')"
            />
            <UButton
              :to="localePath('/app/auth/login')"
              size="xl"
              class="justify-center"
              color="neutral"
              variant="outline"
              :label="t('landing.ctaLogin')"
            />
          </div>
          <p class="text-sm text-muted">
            {{ t('landing.noCard') }}
          </p>
        </div>
        <!-- Phone mockup: a scheduled post and the Etalase it sells through -->
        <div
          class="relative mx-auto w-full max-w-sm"
          aria-hidden="true"
        >
          <div class="absolute -inset-8 bg-primary/10 blur-3xl rounded-full" />
          <div class="relative rounded-[2.5rem] border-8 border-neutral-900 dark:border-neutral-700 bg-default shadow-2xl overflow-hidden">
            <div class="p-4 space-y-3 bg-elevated/40">
              <div class="rounded-xl bg-default border border-default p-3 space-y-2">
                <div class="flex items-center gap-2">
                  <div class="size-7 rounded-full bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600" />
                  <span class="text-xs font-semibold text-highlighted">kreator.hemat</span>
                  <UIcon
                    name="i-simple-icons-instagram"
                    class="size-3.5 ml-auto text-muted"
                  />
                </div>
                <div class="aspect-[4/3] rounded-lg bg-gradient-to-br from-rose-200 via-pink-300 to-fuchsia-300 dark:from-rose-900 dark:via-pink-800 dark:to-fuchsia-900 flex items-center justify-center">
                  <UIcon
                    name="i-lucide-sparkles"
                    class="size-10 text-white/80"
                  />
                </div>
                <p class="text-xs text-default leading-snug">
                  {{ t('landing.mockCaption') }}
                </p>
                <span class="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><UIcon
                  name="i-lucide-clock"
                  class="size-3"
                />{{ t('landing.mockScheduled') }}</span>
              </div>
              <div class="rounded-xl bg-default border border-default p-3">
                <p class="text-[11px] font-semibold text-muted mb-2">
                  ETALASE
                </p>
                <div class="grid grid-cols-3 gap-2">
                  <div
                    v-for="(c, i) in ['from-emerald-200 to-teal-300', 'from-sky-200 to-indigo-300', 'from-amber-200 to-orange-300']"
                    :key="i"
                    class="space-y-1"
                  >
                    <div
                      class="aspect-square rounded-md bg-gradient-to-br"
                      :class="c"
                    />
                    <div class="h-1.5 rounded bg-elevated" />
                    <div class="h-4 rounded bg-primary/80" />
                  </div>
                </div>
              </div>
              <div class="rounded-xl bg-default border border-default p-3 flex items-start gap-2">
                <UIcon
                  name="i-lucide-message-circle-reply"
                  class="size-4 text-primary shrink-0 mt-0.5"
                />
                <p class="text-xs text-default">
                  <b>@sari.belanja</b> "mau kak" → <span class="text-primary font-medium">DM terkirim</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Features -->
    <section
      id="fitur"
      class="scroll-mt-20 py-16 sm:py-20 bg-elevated/40"
    >
      <UContainer class="space-y-10">
        <h2
          v-reveal
          class="text-3xl font-bold text-center text-highlighted text-balance"
        >
          {{ t('landing.featuresTitle') }}
        </h2>
        <div class="grid gap-6 md:grid-cols-3">
          <div
            v-for="feature in features"
            :key="feature.title"
            v-reveal
            class="rounded-2xl bg-default border border-default p-6"
          >
            <div class="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <UIcon
                :name="feature.icon"
                class="size-6"
              />
            </div>
            <h3 class="mt-4 font-semibold text-lg text-highlighted">
              {{ t(feature.title) }}
            </h3>
            <p class="mt-2 text-sm text-muted leading-relaxed">
              {{ t(feature.body) }}
            </p>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- How it works -->
    <section
      id="cara-kerja"
      class="scroll-mt-20 py-16 sm:py-20"
    >
      <UContainer class="space-y-10">
        <h2
          v-reveal
          class="text-3xl font-bold text-center text-highlighted"
        >
          {{ t('landing.howTitle') }}
        </h2>
        <ol class="grid gap-6 md:grid-cols-3">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            v-reveal
            class="text-center space-y-3"
          >
            <div class="mx-auto size-14 rounded-full bg-primary text-inverted flex items-center justify-center text-xl font-bold">
              {{ index + 1 }}
            </div>
            <h3 class="font-semibold text-highlighted">
              {{ t(step.title) }}
            </h3>
            <p class="text-sm text-muted max-w-xs mx-auto">
              {{ t(step.body) }}
            </p>
          </li>
        </ol>
        <div
          v-reveal
          class="pt-6"
        >
          <p class="text-center text-sm font-medium text-muted mb-4">
            {{ t('landing.platformsTitle') }}
          </p>
          <div class="flex flex-wrap justify-center gap-3">
            <div
              v-for="p in platforms"
              :key="p.name"
              class="flex items-center gap-2 rounded-full border border-default px-4 py-2"
              :class="p.live ? 'text-default' : 'text-muted opacity-70'"
            >
              <UIcon
                :name="p.icon"
                class="size-4"
              />
              <span class="text-sm">{{ p.name }}</span>
              <UBadge
                v-if="!p.live"
                size="sm"
                color="neutral"
                variant="subtle"
                :label="t('landing.comingSoon')"
              />
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Pricing -->
    <section
      id="harga"
      class="scroll-mt-20 py-16 sm:py-20 bg-elevated/40"
    >
      <UContainer class="space-y-8">
        <div
          v-reveal
          class="text-center space-y-2"
        >
          <h2 class="text-3xl font-bold text-highlighted">
            {{ t('landing.pricingTitle') }}
          </h2>
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
    </section>

    <!-- FAQ -->
    <section
      v-if="faqItems.length"
      id="faq"
      class="scroll-mt-20 py-16 sm:py-20"
    >
      <UContainer class="max-w-3xl space-y-8">
        <h2
          v-reveal
          class="text-3xl font-bold text-center text-highlighted"
        >
          {{ t('landing.faqTitle') }}
        </h2>
        <UAccordion
          :items="faqItems"
          type="multiple"
          :ui="{ trigger: 'text-base font-medium', body: 'text-muted whitespace-pre-line' }"
        />
      </UContainer>
    </section>

    <!-- Contact -->
    <section
      id="kontak"
      class="scroll-mt-20 py-16 sm:py-20 bg-elevated/40"
    >
      <UContainer class="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div
          v-reveal
          class="space-y-4"
        >
          <h2 class="text-3xl font-bold text-highlighted">
            {{ t('landing.contactTitle') }}
          </h2>
          <p class="text-muted">
            {{ t('landing.contactBody') }}
          </p>
          <div class="space-y-2">
            <UButton
              v-if="data?.company.email"
              :to="`mailto:${data.company.email}`"
              external
              color="neutral"
              variant="ghost"
              icon="i-lucide-mail"
              :label="data.company.email"
              class="px-0"
            />
            <UButton
              v-if="whatsappUrl"
              :to="whatsappUrl"
              external
              target="_blank"
              color="neutral"
              variant="outline"
              icon="i-simple-icons-whatsapp"
              :label="t('landing.whatsapp')"
            />
          </div>
        </div>
        <UCard v-reveal>
          <LandingContactForm />
        </UCard>
      </UContainer>
    </section>

    <!-- Final CTA -->
    <section
      v-if="data?.registrationOpen !== false"
      class="py-16 sm:py-20"
    >
      <UContainer>
        <div
          v-reveal
          class="rounded-3xl bg-primary px-6 py-12 text-center space-y-4"
        >
          <h2 class="text-3xl font-bold text-inverted text-balance">
            {{ t('landing.finalTitle') }}
          </h2>
          <p class="text-inverted/90 max-w-xl mx-auto">
            {{ t('landing.finalBody') }}
          </p>
          <UButton
            :to="localePath('/app/auth/register')"
            size="xl"
            color="neutral"
            variant="solid"
            :label="t('landing.ctaRegister')"
            trailing-icon="i-lucide-arrow-right"
          />
        </div>
      </UContainer>
    </section>
  </div>
</template>
