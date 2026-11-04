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
  { art: 'connect', photo: '1759215524547-6aa9692ceea2', icon: 'i-lucide-circle-check', title: 'landing.step1Title', body: 'landing.step1Body' },
  { art: 'compose', photo: '1758598304346-1b01479f681a', icon: 'i-lucide-pen-line', title: 'landing.step2Title', body: 'landing.step2Body' },
  { art: 'time', photo: '1758273705867-c7d3d0eac839', icon: 'i-lucide-clock', title: 'landing.step3Title', body: 'landing.step3Body' }
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

// The hero's email pill only carries the address over: sign-up still asks for everything else.
const heroEmail = ref('')
function startRegister() {
  const email = heroEmail.value.trim()
  return navigateTo({ path: localePath('/app/auth/register'), query: email ? { email } : undefined })
}

// Stand-in photos (Unsplash): the page speaks in photos only, with the product shown as small white cards pinned
// on them. Each hero tile wears the label of the job it shows.
const unsplash = (id: string, size = 480) => `https://images.unsplash.com/photo-${id}?w=${size}&h=${size}&fit=crop&auto=format&q=70`
const tiles = [
  { photo: '1632200011588-7c252c8c8fbf', label: 'scheduled', icon: 'i-lucide-calendar-clock', tilt: '-rotate-[9deg] translate-y-6', edge: true },
  { photo: '1768987439370-bd60d3d0b28b', label: 'clicks', icon: 'i-lucide-mouse-pointer-click', tilt: '-rotate-[4deg]', edge: false },
  { photo: '1758274252266-e8b2118cf147', label: 'posted', icon: 'i-lucide-circle-check', tilt: 'rotate-[2deg] -translate-y-3', edge: false },
  { photo: '1739269552505-9263189ce9eb', label: 'reply', icon: 'i-lucide-message-circle-reply', tilt: 'rotate-[6deg] translate-y-1', edge: false },
  { photo: '1770013413878-2530e2c3d82b', label: 'etalase', icon: 'i-lucide-store', tilt: 'rotate-[11deg] translate-y-7', edge: true }
]
// Landing motion (main.css "Landing motion"): grid cards reveal one after another along a row of three, and the hero
// tiles fan out from a stack in the middle, centre first, the outer ones last.
const stagger = (index: number) => ({ '--reveal-delay': `${(index % 3) * 90}ms` })
const fanStyle = (index: number) => ({
  '--fan-x': `${(2 - index) * 80}%`,
  '--enter-delay': `${350 + Math.abs(index - 2) * 110}ms`
})
const featureCards: Record<typeof features[number], { icon: string, photo: string }> = {
  schedule: { icon: 'i-lucide-calendar-clock', photo: '1748636879951-f4a4a7a2b794' },
  editor: { icon: 'i-lucide-crop', photo: '1759393851752-47a6ced4f604' },
  hashtags: { icon: 'i-lucide-hash', photo: '1759215524472-1b0686fdbd87' },
  links: { icon: 'i-lucide-link', photo: '1717467192309-75c85e12085c' },
  etalase: { icon: 'i-lucide-store', photo: '1753161618037-e6a8f740fd47' },
  reply: { icon: 'i-lucide-message-circle-reply', photo: '1633504564362-9097e06b1934' }
}
</script>

<template>
  <div>
    <!-- Hero: one big promise, an email pill to start, and a fan of photos showing the work done by itself -->
    <section
      id="beranda"
      class="relative scroll-mt-20 overflow-hidden pt-10 pb-16 sm:pt-20 sm:pb-24"
    >
      <UContainer class="space-y-12 sm:space-y-16">
        <div class="mx-auto max-w-4xl space-y-6 text-center">
          <h1 class="landing-enter landing-display text-[2.75rem] sm:text-6xl lg:text-[4.9rem] text-balance">
            {{ t('landing.heroTitle') }}
          </h1>
          <p
            class="landing-enter mx-auto max-w-2xl text-base sm:text-lg text-toned text-pretty"
            style="--enter-delay: 100ms"
          >
            {{ t('landing.heroBody') }}
          </p>

          <UButton
            v-if="signedIn"
            :to="localePath('/app')"
            size="xl"
            class="landing-enter rounded-full px-7"
            style="--enter-delay: 200ms"
            :label="t('landing.ctaApp')"
            trailing-icon="i-lucide-arrow-right"
          />
          <template v-else>
            <form
              v-if="registrationOpen"
              class="landing-enter mx-auto flex max-w-md items-center gap-2 rounded-full bg-(--landing-card) p-1.5 shadow-lg shadow-black/5 ring-1 ring-(--landing-hairline)"
              style="--enter-delay: 200ms"
              @submit.prevent="startRegister"
            >
              <label
                for="hero-email"
                class="sr-only"
              >{{ t('landing.form.email') }}</label>
              <input
                id="hero-email"
                v-model="heroEmail"
                type="email"
                autocomplete="email"
                inputmode="email"
                :placeholder="t('landing.emailPlaceholder')"
                class="min-w-0 flex-1 bg-transparent pl-4 text-base text-highlighted placeholder:text-dimmed focus:outline-none"
              >
              <UButton
                v-spark
                type="submit"
                size="lg"
                class="group shrink-0 rounded-full px-5"
                :ui="{ trailingIcon: 'motion-safe:transition-transform motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1' }"
                :label="t('landing.ctaRegister')"
                trailing-icon="i-lucide-arrow-right"
              />
            </form>
            <UButton
              v-else
              size="xl"
              class="rounded-full"
              color="neutral"
              variant="soft"
              disabled
              :label="t('landing.ctaClosed')"
            />
            <p
              class="landing-enter text-sm text-muted"
              style="--enter-delay: 260ms"
            >
              {{ t('landing.haveAccount') }}
              <NuxtLink
                :to="localePath('/app/auth/login')"
                class="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {{ t('landing.ctaLogin') }}
              </NuxtLink>
            </p>
          </template>

          <div class="flex flex-wrap justify-center gap-2">
            <span
              v-for="(chip, index) in planChips"
              :key="chip"
              class="landing-pop rounded-full bg-(--landing-card)/70 px-3 py-1 text-sm font-medium text-toned ring-1 ring-(--landing-hairline)"
              :style="{ '--enter-delay': `${380 + index * 70}ms` }"
            >{{ chip }}</span>
          </div>
        </div>

        <!-- The fan: tilted, overlapping photo tiles; the outer two only on wider screens -->
        <ul
          class="flex items-center justify-center"
          :aria-label="t('landing.tiles.label')"
        >
          <li
            v-for="(tile, index) in tiles"
            :key="tile.photo"
            class="landing-fan relative -mx-3 sm:-mx-4"
            :class="[tile.tilt, tile.edge ? 'hidden sm:block' : '', index === 2 ? 'z-10' : '']"
            :style="fanStyle(index)"
          >
            <div
              class="landing-bob"
              :style="{ '--bob-delay': `${-index * 1.3}s` }"
            >
              <div class="landing-tile relative size-32 overflow-hidden bg-(--landing-card) sm:size-40 lg:size-48">
                <img
                  :src="unsplash(tile.photo)"
                  alt=""
                  width="480"
                  height="480"
                  :loading="index === 2 ? 'eager' : 'lazy'"
                  class="size-full object-cover"
                >
                <span
                  class="landing-pop absolute inset-x-1.5 bottom-2 items-center justify-center gap-1 truncate rounded-full bg-white/90 px-1.5 py-1 text-[10px] sm:px-2 sm:text-[11px] font-semibold text-neutral-900 backdrop-blur sm:inset-x-3 sm:bottom-3 sm:flex sm:text-xs"
                  :class="index === 2 ? 'flex' : 'hidden'"
                  :style="{ '--enter-delay': `${1000 + Math.abs(index - 2) * 120}ms` }"
                >
                  <UIcon
                    :name="tile.icon"
                    class="size-3.5 shrink-0 text-(--color-brand-600)"
                  />
                  <span class="truncate">{{ t(`landing.tiles.${tile.label}`) }}</span>
                </span>
              </div>
            </div>
          </li>
        </ul>

        <p
          class="landing-enter flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted"
          style="--enter-delay: 900ms"
        >
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
      </UContainer>
    </section>

    <!-- Sound familiar? One black block: the feature bar on top, then a newcomer's pains as plain text cards,
         each pointing to its fix. Words only here; the photos start with the answer below. -->
    <section
      id="masalah"
      class="scroll-mt-20 bg-neutral-950 text-white dark:border-y dark:border-white/10 dark:bg-black"
    >
      <nav
        class="border-b border-white/10"
        :aria-label="t('landing.nav.features')"
      >
        <UContainer>
          <ul class="flex items-center gap-6 overflow-x-auto py-4 [scrollbar-width:none] sm:justify-center sm:gap-8">
            <li
              v-for="key in features"
              :key="key"
              class="shrink-0"
            >
              <a
                href="#fitur"
                class="inline-flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white sm:text-base"
              >
                <UIcon
                  :name="featureCards[key].icon"
                  class="size-4"
                />
                {{ t(`landing.cards.${key}.title`) }}
              </a>
            </li>
          </ul>
        </UContainer>
      </nav>
      <UContainer class="space-y-12 py-16 sm:py-24">
        <div
          v-reveal
          class="mx-auto max-w-2xl space-y-3 text-center"
        >
          <h2 class="landing-heading text-3xl sm:text-5xl text-balance text-white!">
            {{ t('landing.pain.title') }}
          </h2>
          <p class="text-lg text-white/70 text-pretty">
            {{ t('landing.pain.body') }}
          </p>
        </div>
        <ol class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="(key, index) in features"
            :key="key"
            v-reveal
            class="flex flex-col rounded-[2rem] bg-white/[0.06] p-6 ring-1 ring-white/10 sm:p-7"
            :style="stagger(index)"
          >
            <span class="text-sm font-black italic text-(--color-brand-400)">{{ String(index + 1).padStart(2, '0') }}</span>
            <h3 class="mt-3 text-xl font-bold italic">
              {{ t(`landing.pain.items.${key}.title`) }}
            </h3>
            <p class="mt-2 text-sm text-white/70">
              {{ t(`landing.pain.items.${key}.body`) }}
            </p>
            <p
              class="landing-pin mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-(--color-brand-300)"
              style="--pin-delay: 400ms"
            >
              <UIcon
                name="i-lucide-circle-check"
                class="size-4 shrink-0"
              />
              {{ t(`landing.pain.items.${key}.fix`) }}
            </p>
          </li>
        </ol>
      </UContainer>
    </section>

    <!-- Features: the same six jobs, done by Socialz.id. A photo of the moment, with the product's answer
         pinned on it as a small white card (the same language as the hero tiles). -->
    <section
      id="fitur"
      class="scroll-mt-20 py-16 sm:py-28"
    >
      <UContainer class="space-y-12">
        <div
          v-reveal
          class="mx-auto max-w-2xl space-y-3 text-center"
        >
          <h2 class="landing-heading text-3xl sm:text-5xl text-balance">
            {{ t('landing.featuresTitle') }}
          </h2>
          <p class="text-lg text-muted text-pretty">
            {{ t('landing.featuresBody') }}
          </p>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="(key, index) in features"
            :key="key"
            v-reveal
            class="group landing-card flex flex-col rounded-[2rem] p-2.5"
            :style="stagger(index)"
          >
            <div class="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-elevated">
              <img
                :src="unsplash(featureCards[key].photo, 640)"
                alt=""
                width="640"
                height="480"
                loading="lazy"
                class="size-full object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-105"
              >
              <span class="landing-pin absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-2xl bg-white/95 py-2 pr-3.5 pl-2 text-neutral-900 shadow-lg backdrop-blur">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-brand-50) text-(--color-brand-600)">
                  <UIcon
                    :name="featureCards[key].icon"
                    class="size-4"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold">{{ t(`landing.chips.${key}.title`) }}</span>
                  <span class="block truncate text-xs text-neutral-500">{{ t(`landing.chips.${key}.sub`) }}</span>
                </span>
              </span>
            </div>
            <div class="px-4 pt-5 pb-4">
              <h3 class="text-xl font-bold italic text-highlighted">
                {{ t(`landing.cards.${key}.title`) }}
              </h3>
              <p class="mt-1 text-muted text-pretty">
                {{ t(`landing.cards.${key}.body`) }}
              </p>
            </div>
          </article>
        </div>
      </UContainer>
    </section>

    <!-- How it works: three photo steps, numbered -->
    <section
      id="cara-kerja"
      class="scroll-mt-20 pb-16 sm:pb-28"
    >
      <UContainer class="space-y-12">
        <h2
          v-reveal
          class="landing-heading text-center text-3xl sm:text-5xl"
        >
          {{ t('landing.howTitle') }}
        </h2>
        <ol class="grid gap-5 md:grid-cols-3">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            v-reveal
            class="group landing-card flex flex-col rounded-[2rem] p-2.5"
            :style="stagger(index)"
          >
            <div class="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-elevated">
              <img
                :src="unsplash(step.photo, 640)"
                alt=""
                width="640"
                height="480"
                loading="lazy"
                class="size-full object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-105"
              >
              <span
                class="landing-pin absolute top-3 left-3 flex size-10 items-center justify-center rounded-full bg-white text-lg font-black italic text-neutral-900 shadow-lg"
                style="--pin-delay: 200ms"
              >{{ index + 1 }}</span>
              <span
                class="landing-pin absolute right-3 bottom-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full bg-white/95 py-1.5 pr-3.5 pl-2 text-sm font-semibold text-neutral-900 shadow-lg backdrop-blur"
                style="--pin-delay: 400ms"
              >
                <UIcon
                  :name="step.icon"
                  class="size-4 shrink-0 text-(--color-brand-600)"
                />
                <span class="truncate">{{ t(`landing.chips.${step.art}`) }}</span>
              </span>
            </div>
            <div class="px-4 pt-5 pb-4">
              <h3 class="text-xl font-bold italic text-highlighted">
                {{ t(step.title) }}
              </h3>
              <p class="mt-1 text-muted text-pretty">
                {{ t(step.body) }}
              </p>
            </div>
          </li>
        </ol>
      </UContainer>
    </section>

    <!-- Just starting out: a creator's photo with the reassurances beside it -->
    <section class="pb-16 sm:pb-28">
      <UContainer>
        <div class="landing-card grid items-center gap-10 overflow-hidden rounded-[2rem] p-6 sm:rounded-[2.75rem] sm:p-10 lg:grid-cols-[1fr_1.2fr] lg:gap-14 lg:p-14">
          <div
            v-reveal
            class="relative mx-auto w-full max-w-sm"
          >
            <div class="landing-tile aspect-[4/5] -rotate-3 overflow-hidden">
              <img
                :src="unsplash('1755434613831-1a8cb00bfb2c', 640)"
                alt=""
                width="640"
                height="800"
                loading="lazy"
                class="size-full object-cover"
              >
            </div>
            <span
              class="landing-bob absolute -right-2 top-8 flex rotate-6 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-lg sm:-right-6"
              style="--bob-delay: -2s"
            >
              <UIcon
                name="i-lucide-smartphone"
                class="size-4 text-(--color-brand-600)"
              />
              {{ t('landing.tiles.phone') }}
            </span>
            <span
              class="landing-bob absolute -left-2 bottom-10 flex -rotate-6 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-lg sm:-left-6"
              style="--bob-delay: -5s"
            >
              <UIcon
                name="i-lucide-party-popper"
                class="size-4 text-(--color-brand-600)"
              />
              {{ t('landing.tiles.first') }}
            </span>
          </div>
          <div
            v-reveal
            class="space-y-8"
          >
            <div class="space-y-3 text-center lg:text-left">
              <h2 class="landing-heading text-3xl sm:text-5xl text-balance">
                {{ t('landing.newbie.title') }}
              </h2>
              <p class="text-lg text-muted text-pretty">
                {{ t('landing.newbie.body') }}
              </p>
            </div>
            <ul class="grid gap-6 sm:grid-cols-2">
              <li
                v-for="(point, index) in newbiePoints"
                :key="point.key"
                class="landing-pin flex gap-3"
                :style="{ '--pin-delay': `${200 + index * 90}ms` }"
              >
                <span class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UIcon
                    :name="point.icon"
                    class="size-5"
                  />
                </span>
                <div>
                  <h3 class="font-bold italic text-highlighted">
                    {{ t(`landing.newbie.points.${point.key}.title`) }}
                  </h3>
                  <p class="mt-0.5 text-sm text-muted">
                    {{ t(`landing.newbie.points.${point.key}.body`) }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Pricing -->
    <section
      id="harga"
      class="scroll-mt-20 pb-16 sm:pb-28"
    >
      <UContainer class="space-y-10">
        <div
          v-reveal
          class="text-center space-y-3"
        >
          <h2 class="landing-heading text-3xl sm:text-5xl">
            {{ t('landing.pricingTitle') }}
          </h2>
          <p class="text-lg text-muted">
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

    <!-- FAQ: label and heading on the left, one white card per question on the right -->
    <section
      v-if="faqItems.length"
      id="faq"
      class="scroll-mt-20 pb-16 sm:pb-28"
    >
      <UContainer class="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div
          v-reveal
          class="space-y-3 text-center lg:sticky lg:top-28 lg:self-start lg:text-left"
        >
          <p class="text-sm font-semibold uppercase tracking-widest text-primary">
            {{ t('landing.nav.faq') }}
          </p>
          <h2 class="landing-heading text-3xl sm:text-5xl text-balance">
            {{ t('landing.faqTitle') }}
          </h2>
          <p class="text-muted">
            {{ t('landing.faqBody') }}
          </p>
        </div>
        <UAccordion
          :items="faqItems"
          type="multiple"
          :ui="{
            root: 'space-y-3',
            item: 'landing-card rounded-[1.75rem] border-b-0 px-6',
            trigger: 'py-5 text-base font-semibold italic text-highlighted',
            trailingIcon: 'text-muted',
            body: 'pb-5 text-muted whitespace-pre-line'
          }"
        />
      </UContainer>
    </section>

    <!-- Contact -->
    <section
      id="kontak"
      class="scroll-mt-20 pb-16 sm:pb-28"
    >
      <UContainer class="grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div class="space-y-4 text-center lg:text-left">
          <h2 class="landing-heading text-3xl sm:text-5xl">
            {{ t('landing.contactTitle') }}
          </h2>
          <p class="text-muted">
            {{ t('landing.contactBody') }}
          </p>
          <div class="flex flex-col items-center gap-2 lg:items-start">
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
              class="rounded-full px-4"
              :label="t('landing.whatsapp')"
            />
          </div>
        </div>
        <div class="landing-card rounded-[2rem] p-6 sm:rounded-[2.5rem] sm:p-8">
          <LandingContactForm />
        </div>
      </UContainer>
    </section>

    <!-- Final CTA: the app icon, one line, one pill -->
    <section
      v-if="registrationOpen || signedIn"
      class="pt-8 pb-20 sm:pb-28"
    >
      <UContainer class="text-center space-y-6">
        <div class="landing-bob">
          <BrandMark
            v-reveal
            class="landing-tile mx-auto size-20 -rotate-6 sm:size-24"
          />
        </div>
        <h2 class="landing-display text-4xl sm:text-6xl text-balance">
          {{ t('landing.finalTitle') }}
        </h2>
        <p
          v-if="!signedIn"
          class="text-lg text-muted"
        >
          {{ t('landing.noCard') }}
        </p>
        <UButton
          :to="localePath(signedIn ? '/app' : '/app/auth/register')"
          size="xl"
          class="rounded-full px-7"
          :label="t(signedIn ? 'landing.ctaApp' : 'landing.ctaRegister')"
          trailing-icon="i-lucide-arrow-right"
        />
      </UContainer>
    </section>
  </div>
</template>
