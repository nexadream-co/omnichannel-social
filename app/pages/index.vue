<script setup lang="ts">
interface Plan { slug: string, name: string, description: string | null, priceMonthly: number, priceYearly: number, trialDays: number, limits: Record<string, number>, features: Record<string, boolean> }
interface Landing {
  plans: Plan[]
  faqs: { id: string, question: string, answer: string, category: string }[]
  company: { name: string, tagline: string, email: string, whatsapp: string, instagram: string, threads: string, tiktok: string, youtube: string }
  trialPlanSlug: string
  registrationOpen: boolean
}

const { t, locale } = useI18n()
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

const registrationOpen = computed(() => data.value?.registrationOpen !== false)
// Hero price chips come from the plans themselves, so they never disagree with the pricing section.
const planChips = computed(() => {
  const plans = data.value?.plans ?? []
  const free = plans.find(p => p.priceMonthly === 0)
  const paid = plans.filter(p => p.priceMonthly > 0).sort((a, b) => a.priceMonthly - b.priceMonthly)[0]
  const trial = plans.find(p => p.slug === data.value?.trialPlanSlug && p.trialDays > 0)
  return [
    free && t('landing.plan.free', { plan: free.name }),
    paid && t('landing.plan.paid', { plan: paid.name, price: formatIDR(paid.priceMonthly, locale.value) }),
    trial && t('landing.trialBadge', { n: trial.trialDays })
  ].filter(Boolean) as string[]
})

const soon = [
  { name: 'TikTok', icon: 'i-simple-icons-tiktok' },
  { name: 'YouTube', icon: 'i-simple-icons-youtube' },
  { name: 'X', icon: 'i-simple-icons-x' }
]
// Each feature as a tiny flow of icons: what goes in, what happens, what comes out.
const cards = [
  { key: 'schedule', flow: [['i-lucide-pen-line'], ['i-lucide-clock'], ['i-simple-icons-instagram', 'i-simple-icons-threads', 'i-simple-icons-facebook']] },
  { key: 'links', flow: [['i-lucide-link'], ['i-lucide-mouse-pointer-click'], ['i-lucide-chart-column']] },
  { key: 'etalase', flow: [['i-simple-icons-instagram'], ['i-lucide-link-2'], ['i-lucide-store']] },
  { key: 'reply', flow: [['i-lucide-message-circle'], ['i-lucide-message-circle-reply'], ['i-lucide-send']] }
]
const steps = [
  { icon: 'i-lucide-plug', title: 'landing.step1Title', body: 'landing.step1Body' },
  { icon: 'i-lucide-link', title: 'landing.step2Title', body: 'landing.step2Body' },
  { icon: 'i-lucide-calendar-check', title: 'landing.step3Title', body: 'landing.step3Body' }
]
const payMethods = [
  { key: 'qris', icon: 'i-lucide-qr-code' },
  { key: 'ewallet', icon: 'i-lucide-wallet' },
  { key: 'va', icon: 'i-lucide-landmark' },
  { key: 'card', icon: 'i-lucide-credit-card' }
]
const faqItems = computed(() => (data.value?.faqs ?? []).map(f => ({ label: f.question, content: f.answer, value: f.id })))
const whatsappUrl = computed(() => data.value?.company.whatsapp ? `https://wa.me/${data.value.company.whatsapp.replace(/\D/g, '')}` : null)
</script>

<template>
  <div>
    <!-- Hero: one sentence, the price, and the many-to-one picture -->
    <section
      id="beranda"
      class="scroll-mt-20 pt-12 pb-14 sm:pt-16 sm:pb-20"
    >
      <UContainer class="space-y-10 sm:space-y-12">
        <div class="mx-auto max-w-2xl space-y-5 text-center">
          <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-highlighted text-balance">
            {{ t('landing.heroTitle') }}
          </h1>
          <p class="text-lg text-muted text-pretty">
            {{ t('landing.heroBody') }}
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <UButton
              v-if="registrationOpen"
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
          <div class="flex flex-wrap justify-center gap-2">
            <UBadge
              v-for="chip in planChips"
              :key="chip"
              color="neutral"
              variant="outline"
              size="lg"
              :label="chip"
            />
          </div>
        </div>

        <LandingUnifyFlow v-reveal />

        <p class="flex items-center justify-center gap-2 text-sm text-muted">
          {{ t('landing.soon') }}
          <UIcon
            v-for="p in soon"
            :key="p.name"
            :name="p.icon"
            class="size-4"
            :aria-label="p.name"
          />
        </p>
      </UContainer>
    </section>

    <!-- Features: four cards, each a small icon flow and one line -->
    <section
      id="fitur"
      class="scroll-mt-20 border-t border-default py-14 sm:py-20"
    >
      <UContainer class="space-y-10">
        <h2
          v-reveal
          class="text-center text-2xl sm:text-3xl font-bold tracking-tight text-highlighted text-balance"
        >
          {{ t('landing.featuresTitle') }}
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="card in cards"
            :key="card.key"
            v-reveal
            class="rounded-xl border border-default p-5 space-y-4"
          >
            <div
              class="flex items-center gap-1.5"
              aria-hidden="true"
            >
              <template
                v-for="(step, i) in card.flow"
                :key="i"
              >
                <span
                  class="h-10 min-w-10 px-2 rounded-lg flex items-center justify-center gap-1"
                  :class="i === card.flow.length - 1 ? 'bg-primary text-inverted' : 'bg-elevated text-default'"
                >
                  <UIcon
                    v-for="icon in step"
                    :key="icon"
                    :name="icon"
                    class="size-4"
                  />
                </span>
                <UIcon
                  v-if="i < card.flow.length - 1"
                  name="i-lucide-arrow-right"
                  class="size-3.5 text-dimmed"
                />
              </template>
            </div>
            <div>
              <h3 class="font-semibold text-highlighted">
                {{ t(`landing.cards.${card.key}.title`) }}
              </h3>
              <p class="mt-1 text-sm text-muted">
                {{ t(`landing.cards.${card.key}.body`) }}
              </p>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- How it works: three steps joined by arrows -->
    <section
      id="cara-kerja"
      class="scroll-mt-20 border-t border-default py-14 sm:py-20"
    >
      <UContainer class="space-y-10">
        <h2
          v-reveal
          class="text-center text-2xl sm:text-3xl font-bold tracking-tight text-highlighted"
        >
          {{ t('landing.howTitle') }}
        </h2>
        <ol class="grid gap-8 md:grid-cols-3 md:gap-4">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            v-reveal
            class="relative flex flex-col items-center text-center gap-3"
          >
            <span class="relative size-14 rounded-2xl border border-default flex items-center justify-center">
              <UIcon
                :name="step.icon"
                class="size-6 text-primary"
              />
              <span class="absolute -top-2 -right-2 size-6 rounded-full bg-primary text-inverted text-xs font-semibold flex items-center justify-center">{{ index + 1 }}</span>
            </span>
            <UIcon
              v-if="index < steps.length - 1"
              name="i-lucide-arrow-right"
              class="hidden md:block absolute top-5 -right-3 size-5 text-dimmed"
              aria-hidden="true"
            />
            <h3 class="font-semibold text-highlighted">
              {{ t(step.title) }}
            </h3>
            <p class="text-sm text-muted max-w-56">
              {{ t(step.body) }}
            </p>
          </li>
        </ol>
      </UContainer>
    </section>

    <!-- Pricing -->
    <section
      id="harga"
      class="scroll-mt-20 border-t border-default py-14 sm:py-20"
    >
      <UContainer class="space-y-8">
        <div
          v-reveal
          class="text-center space-y-2"
        >
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-highlighted">
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
        <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted">
          <span>{{ t('landing.pay.title') }}</span>
          <span
            v-for="m in payMethods"
            :key="m.key"
            class="inline-flex items-center gap-1.5 text-default"
          >
            <UIcon
              :name="m.icon"
              class="size-4"
            />
            {{ t(`landing.pay.${m.key}`) }}
          </span>
        </div>
      </UContainer>
    </section>

    <!-- FAQ -->
    <section
      v-if="faqItems.length"
      id="faq"
      class="scroll-mt-20 border-t border-default py-14 sm:py-20"
    >
      <UContainer class="max-w-3xl space-y-8">
        <h2
          v-reveal
          class="text-center text-2xl sm:text-3xl font-bold tracking-tight text-highlighted"
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
      class="scroll-mt-20 border-t border-default py-14 sm:py-20"
    >
      <UContainer class="grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
        <div class="space-y-4">
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-highlighted">
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
        <UCard>
          <LandingContactForm />
        </UCard>
      </UContainer>
    </section>

    <!-- Final CTA -->
    <section
      v-if="registrationOpen"
      class="border-t border-default py-14 sm:py-20"
    >
      <UContainer class="text-center space-y-5">
        <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-highlighted text-balance">
          {{ t('landing.finalTitle') }}
        </h2>
        <UButton
          :to="localePath('/app/auth/register')"
          size="xl"
          :label="t('landing.ctaRegister')"
          trailing-icon="i-lucide-arrow-right"
        />
      </UContainer>
    </section>
  </div>
</template>
