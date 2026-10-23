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
const { signedIn } = usePublicSession()
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

const live = [
  { name: 'Instagram', icon: 'i-simple-icons-instagram' },
  { name: 'Threads', icon: 'i-simple-icons-threads' },
  { name: 'Facebook', icon: 'i-simple-icons-facebook' }
]
const soon = [
  { name: 'TikTok', icon: 'i-simple-icons-tiktok' },
  { name: 'YouTube', icon: 'i-simple-icons-youtube' },
  { name: 'X', icon: 'i-simple-icons-x' }
]
// One pain per feature, in the same order: the "Kenal rasanya?" cards point to the feature that fixes them.
const features = ['schedule', 'editor', 'hashtags', 'links', 'etalase', 'reply'] as const
const steps = [
  { art: 'connect', title: 'landing.step1Title', body: 'landing.step1Body' },
  { art: 'compose', title: 'landing.step2Title', body: 'landing.step2Body' },
  { art: 'time', title: 'landing.step3Title', body: 'landing.step3Body' }
] as const
const newbiePoints = [
  { key: 'free', icon: 'i-lucide-gift' },
  { key: 'phone', icon: 'i-lucide-smartphone' },
  { key: 'plain', icon: 'i-lucide-message-circle-heart' },
  { key: 'guided', icon: 'i-lucide-list-checks' }
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
    <!-- Hero: one friendly promise, the price, and a phone where the work happens by itself -->
    <section
      id="beranda"
      class="scroll-mt-20 overflow-hidden pt-10 pb-14 sm:pt-16 sm:pb-20"
    >
      <UContainer class="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div class="mx-auto max-w-xl space-y-5 text-center lg:mx-0 lg:text-left">
          <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-highlighted text-balance">
            {{ t('landing.heroTitle') }}
          </h1>
          <p class="text-lg text-muted text-pretty">
            {{ t('landing.heroBody') }}
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <UButton
              v-if="signedIn"
              :to="localePath('/app')"
              size="xl"
              class="justify-center"
              :label="t('landing.ctaApp')"
              trailing-icon="i-lucide-arrow-right"
            />
            <template v-else>
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
            </template>
          </div>
          <div class="flex flex-wrap justify-center gap-2 lg:justify-start">
            <UBadge
              v-for="chip in planChips"
              :key="chip"
              color="neutral"
              variant="outline"
              size="lg"
              :label="chip"
            />
          </div>
          <p class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted lg:justify-start">
            <span class="inline-flex items-center gap-2 text-default">
              {{ t('landing.worksWith') }}
              <UIcon
                v-for="p in live"
                :key="p.name"
                :name="p.icon"
                class="size-4"
                :aria-label="p.name"
              />
            </span>
            <span aria-hidden="true">·</span>
            <span class="inline-flex items-center gap-2">
              {{ t('landing.soon') }}
              <UIcon
                v-for="p in soon"
                :key="p.name"
                :name="p.icon"
                class="size-4"
                :aria-label="p.name"
              />
            </span>
          </p>
        </div>

        <LandingHeroArt v-reveal />
      </UContainer>
    </section>

    <!-- Sound familiar? A newcomer's pains, each pointing to its fix -->
    <section
      id="masalah"
      class="scroll-mt-20 border-t border-default bg-muted/40 py-14 sm:py-20"
    >
      <UContainer class="space-y-10">
        <div
          v-reveal
          class="mx-auto max-w-2xl space-y-2 text-center"
        >
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-highlighted text-balance">
            {{ t('landing.pain.title') }}
          </h2>
          <p class="text-muted text-pretty">
            {{ t('landing.pain.body') }}
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="key in features"
            :key="key"
            v-reveal
            class="flex flex-col rounded-xl border border-default bg-default p-3"
          >
            <LandingPainArt :kind="key" />
            <div class="flex flex-1 flex-col px-2 pt-4 pb-1">
              <h3 class="font-semibold text-highlighted">
                {{ t(`landing.pain.items.${key}.title`) }}
              </h3>
              <p class="mt-1 text-sm text-muted">
                {{ t(`landing.pain.items.${key}.body`) }}
              </p>
              <p class="art-ink mt-auto flex items-center gap-1.5 pt-3 text-sm font-medium">
                <UIcon
                  name="i-lucide-circle-check"
                  class="size-4 shrink-0"
                />
                {{ t(`landing.pain.items.${key}.fix`) }}
              </p>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Features: the same six jobs, done by Socialz.id. Wide cards (picture beside the words) so this
         reads as the answer to the grid above, not a second copy of it. -->
    <section
      id="fitur"
      class="scroll-mt-20 border-t border-default py-14 sm:py-20"
    >
      <UContainer class="space-y-10">
        <div
          v-reveal
          class="mx-auto max-w-2xl space-y-2 text-center"
        >
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-highlighted text-balance">
            {{ t('landing.featuresTitle') }}
          </h2>
          <p class="text-muted text-pretty">
            {{ t('landing.featuresBody') }}
          </p>
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <div
            v-for="key in features"
            :key="key"
            v-reveal
            class="grid items-center gap-4 rounded-xl border border-default p-3 sm:grid-cols-[1.1fr_1fr]"
          >
            <LandingFeatureArt :kind="key" />
            <div class="px-2 pb-1 sm:py-2 sm:pr-3 sm:pl-0">
              <h3 class="text-lg font-semibold text-highlighted">
                {{ t(`landing.cards.${key}.title`) }}
              </h3>
              <p class="mt-1 text-sm text-muted text-pretty">
                {{ t(`landing.cards.${key}.body`) }}
              </p>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- How it works: three illustrated steps -->
    <section
      id="cara-kerja"
      class="scroll-mt-20 border-t border-default bg-muted/40 py-14 sm:py-20"
    >
      <UContainer class="space-y-10">
        <h2
          v-reveal
          class="text-center text-2xl sm:text-3xl font-bold tracking-tight text-highlighted"
        >
          {{ t('landing.howTitle') }}
        </h2>
        <ol class="grid gap-4 md:grid-cols-3">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            v-reveal
            class="relative flex flex-col rounded-xl border border-default bg-default p-3 text-center"
          >
            <LandingSceneArt
              :kind="step.art"
              class="rounded-lg bg-elevated/60"
            />
            <span class="mx-auto -mt-3.5 flex size-7 items-center justify-center rounded-full art-chip text-sm font-semibold ring-4 ring-(--ui-bg)">{{ index + 1 }}</span>
            <h3 class="mt-2 font-semibold text-highlighted">
              {{ t(step.title) }}
            </h3>
            <p class="mx-auto mt-1 max-w-64 pb-2 text-sm text-muted">
              {{ t(step.body) }}
            </p>
            <UIcon
              v-if="index < steps.length - 1"
              name="i-lucide-arrow-right"
              class="absolute top-16 -right-3.5 z-10 hidden size-5 text-dimmed md:block"
              aria-hidden="true"
            />
          </li>
        </ol>
      </UContainer>
    </section>

    <!-- Just starting out: what makes it safe to try -->
    <section class="border-t border-default py-14 sm:py-20">
      <UContainer class="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <LandingSceneArt
          v-reveal
          kind="guide"
          class="order-last lg:order-first"
        />
        <div
          v-reveal
          class="space-y-6"
        >
          <div class="space-y-2 text-center lg:text-left">
            <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-highlighted text-balance">
              {{ t('landing.newbie.title') }}
            </h2>
            <p class="text-muted text-pretty">
              {{ t('landing.newbie.body') }}
            </p>
          </div>
          <ul class="grid gap-5 sm:grid-cols-2">
            <li
              v-for="point in newbiePoints"
              :key="point.key"
              class="flex gap-3"
            >
              <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UIcon
                  :name="point.icon"
                  class="size-5"
                />
              </span>
              <div>
                <h3 class="font-semibold text-highlighted">
                  {{ t(`landing.newbie.points.${point.key}.title`) }}
                </h3>
                <p class="mt-0.5 text-sm text-muted">
                  {{ t(`landing.newbie.points.${point.key}.body`) }}
                </p>
              </div>
            </li>
          </ul>
        </div>
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
          <LandingSceneArt
            kind="help"
            class="hidden pt-4 lg:block"
          />
        </div>
        <UCard>
          <LandingContactForm />
        </UCard>
      </UContainer>
    </section>

    <!-- Final CTA -->
    <section
      v-if="registrationOpen || signedIn"
      class="border-t border-default bg-muted/40 py-14 sm:py-20"
    >
      <UContainer class="text-center space-y-5">
        <LandingSceneArt
          v-reveal
          kind="relax"
        />
        <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-highlighted text-balance">
          {{ t('landing.finalTitle') }}
        </h2>
        <p
          v-if="!signedIn"
          class="text-muted"
        >
          {{ t('landing.noCard') }}
        </p>
        <UButton
          :to="localePath(signedIn ? '/app' : '/app/auth/register')"
          size="xl"
          :label="t(signedIn ? 'landing.ctaApp' : 'landing.ctaRegister')"
          trailing-icon="i-lucide-arrow-right"
        />
      </UContainer>
    </section>
  </div>
</template>
