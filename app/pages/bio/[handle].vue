<script setup lang="ts">
import { MERCHANT_META, type Merchant } from '#shared/utils/links'

// Public Etalase (docs/blueprint/14 §4): SSR, no client JS (routeRules noScripts), plain text only.
definePageMeta({ layout: 'bio' })

interface Item { id: string, categoryId: string | null, pinned: boolean, badge: string | null, title: string, imageUrl: string | null, priceIdr: number | null, merchant: Merchant, url: string | null }
interface Storefront {
  state: 'ok'
  handle: string
  title: string
  bio: string | null
  avatarUrl: string | null
  indexable: boolean
  branding: boolean
  theme: { background: string, card: string, text: string, muted: string, accent: string, accentText: string }
  socials: Record<string, string>
  categories: { id: string, name: string }[]
  items: Item[]
}
type Payload = { state: 'not_found' | 'inactive' } | Storefront

const route = useRoute()
const { t } = useI18n()
const handle = String(route.params.handle)
const siteUrl = useRuntimeConfig().public.siteUrl
const query = computed(() => String(route.query.q ?? '').trim().toLowerCase())
const { data } = await useFetch<Payload>(`/api/public/bio/${encodeURIComponent(handle)}`)
const event = useRequestEvent()
if (event && data.value?.state !== 'ok') setResponseStatus(event, 404)

const page = computed(() => data.value?.state === 'ok' ? data.value : null)
const items = computed(() => (page.value?.items ?? []).filter(item => !query.value || item.title.toLowerCase().includes(query.value)))
const priceFormat = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const SOCIAL_URL: Record<string, (v: string) => string> = {
  instagram: v => `https://instagram.com/${v.replace(/^@/, '')}`,
  threads: v => `https://threads.net/@${v.replace(/^@/, '')}`,
  tiktok: v => `https://tiktok.com/@${v.replace(/^@/, '')}`,
  facebook: v => (v.startsWith('http') ? v : `https://facebook.com/${v}`),
  youtube: v => (v.startsWith('http') ? v : `https://youtube.com/@${v.replace(/^@/, '')}`),
  whatsapp: v => `https://wa.me/${v.replace(/\D/g, '').replace(/^0/, '62')}`
}
const SOCIAL_ICON: Record<string, string> = { instagram: 'i-simple-icons-instagram', threads: 'i-simple-icons-threads', tiktok: 'i-simple-icons-tiktok', facebook: 'i-simple-icons-facebook', youtube: 'i-simple-icons-youtube', whatsapp: 'i-simple-icons-whatsapp' }

// CSS-only category tabs: one radio per category, :has() hides the others. No script needed.
const tabCss = computed(() => (page.value?.categories ?? []).map(c => `.sf:has(#cat-${c.id}:checked) .sf-item:not([data-cat="${c.id}"]){display:none}.sf:has(#cat-${c.id}:checked) label[for="cat-${c.id}"]{background:var(--accent)!important;color:var(--accent-text)}`).join('') + '.sf:has(#cat-all:checked) label[for="cat-all"]{background:var(--accent)!important;color:var(--accent-text)}')

// "Beli" says where it is going while it is pressed or focused (CSS only; iOS may skip :active without a touch listener).
const BUY_CSS = '.sf-buy-open{display:none}.sf-item a:is(:active,:focus-visible) .sf-buy-idle{display:none}.sf-item a:is(:active,:focus-visible) .sf-buy-open{display:inline}'

useHead(() => ({
  title: page.value ? `${page.value.title} · Etalase` : t('storefront.notFound'),
  htmlAttrs: { lang: 'id' },
  meta: [
    { name: 'description', content: page.value?.bio ?? '' },
    { name: 'robots', content: page.value?.indexable ? 'index,follow' : 'noindex' },
    { property: 'og:title', content: page.value?.title ?? '' },
    { property: 'og:image', content: page.value?.avatarUrl ?? '' }
  ],
  style: [{ innerHTML: BUY_CSS + tabCss.value }]
}))
</script>

<template>
  <div
    v-if="page"
    class="sf min-h-dvh"
    :style="{ '--bg': page.theme.background, '--card': page.theme.card, '--text': page.theme.text, '--muted': page.theme.muted, '--accent': page.theme.accent, '--accent-text': page.theme.accentText, 'background': 'var(--bg)', 'color': 'var(--text)' }"
  >
    <main class="mx-auto w-full max-w-md px-4 py-8">
      <header class="text-center space-y-3">
        <img
          v-if="page.avatarUrl"
          :src="page.avatarUrl"
          :alt="page.title"
          width="88"
          height="88"
          class="mx-auto size-22 rounded-full object-cover"
          fetchpriority="high"
        >
        <div
          v-else
          class="mx-auto size-22 rounded-full flex items-center justify-center text-3xl font-bold"
          style="background: var(--accent); color: var(--accent-text)"
        >
          {{ page.title.slice(0, 1).toUpperCase() }}
        </div>
        <h1 class="text-xl font-bold">
          {{ page.title }}
        </h1>
        <p
          v-if="page.bio"
          class="text-sm whitespace-pre-line"
          style="color: var(--muted)"
        >
          {{ page.bio }}
        </p>
        <nav
          v-if="Object.keys(page.socials).length"
          class="flex justify-center gap-3"
        >
          <a
            v-for="(value, key) in page.socials"
            :key="key"
            :href="SOCIAL_URL[key]?.(value)"
            rel="nofollow noopener"
            target="_blank"
            :aria-label="key"
          >
            <UIcon
              :name="SOCIAL_ICON[key] ?? 'i-lucide-link'"
              class="size-5"
            />
          </a>
        </nav>
      </header>

      <form
        method="get"
        class="mt-6"
        role="search"
      >
        <input
          name="q"
          :value="route.query.q ?? ''"
          type="search"
          :placeholder="t('storefront.search')"
          class="w-full rounded-full px-4 py-2.5 text-sm outline-none"
          style="background: var(--card); color: var(--text)"
        >
      </form>

      <div
        v-if="page.categories.length"
        class="mt-4 flex gap-2 overflow-x-auto pb-1"
      >
        <input
          id="cat-all"
          type="radio"
          name="cat"
          class="sr-only"
          checked
        >
        <label
          for="cat-all"
          class="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-sm"
          style="background: var(--card)"
        >{{ t('storefront.all') }}</label>
        <template
          v-for="category in page.categories"
          :key="category.id"
        >
          <input
            :id="`cat-${category.id}`"
            type="radio"
            name="cat"
            class="sr-only"
          >
          <label
            :for="`cat-${category.id}`"
            class="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-sm"
            style="background: var(--card)"
          >{{ category.name }}</label>
        </template>
      </div>

      <p
        v-if="!items.length"
        class="mt-10 text-center text-sm"
        style="color: var(--muted)"
      >
        {{ query ? t('storefront.noResults') : t('storefront.empty') }}
      </p>
      <ul class="mt-4 grid grid-cols-2 gap-3">
        <li
          v-for="item in items"
          :key="item.id"
          class="sf-item rounded-xl overflow-hidden flex flex-col"
          :data-cat="item.categoryId ?? 'none'"
          style="background: var(--card)"
        >
          <a
            :href="item.url!"
            rel="nofollow noopener"
            class="flex flex-col h-full"
          >
            <div class="relative aspect-square overflow-hidden">
              <!-- No script here, so a broken photo is handled in CSS: the tinted initial sits behind the image and shows when it is missing. -->
              <span
                class="absolute inset-0 flex items-center justify-center text-3xl font-bold"
                style="background: color-mix(in srgb, var(--accent) 16%, var(--card)); color: var(--accent)"
                aria-hidden="true"
              >{{ item.title.slice(0, 1).toUpperCase() }}</span>
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                alt=""
                loading="lazy"
                decoding="async"
                width="300"
                height="300"
                class="absolute inset-0 size-full object-cover"
              >
              <span
                v-if="item.badge || item.pinned"
                class="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style="background: var(--accent); color: var(--accent-text)"
              >{{ item.badge || '★' }}</span>
            </div>
            <div class="p-2.5 flex flex-col gap-1 flex-1">
              <span
                class="text-[11px] font-medium"
                :style="{ color: MERCHANT_META[item.merchant].color }"
              >{{ MERCHANT_META[item.merchant].label }}</span>
              <span class="text-sm leading-snug line-clamp-2">{{ item.title }}</span>
              <span
                v-if="item.priceIdr"
                class="text-sm font-semibold"
              >{{ priceFormat.format(item.priceIdr).replace(/\u00A0/g, ' ') }}</span>
              <span class="mt-auto pt-1.5">
                <span
                  class="sf-buy block text-center rounded-lg py-1.5 text-sm font-semibold motion-safe:transition-transform motion-safe:active:scale-[0.97]"
                  style="background: var(--accent); color: var(--accent-text)"
                >
                  <span class="sf-buy-idle">{{ t('storefront.buy') }}</span>
                  <span class="sf-buy-open">{{ t('storefront.opening', { merchant: MERCHANT_META[item.merchant].label }) }}</span>
                </span>
              </span>
            </div>
          </a>
        </li>
      </ul>

      <footer
        v-if="page.branding"
        class="mt-10 text-center text-xs"
        style="color: var(--muted)"
      >
        <a
          :href="`${useRuntimeConfig().public.siteUrl}/?ref=etalase`"
          rel="noopener"
        >{{ t('storefront.madeWith') }}</a>
      </footer>
    </main>
  </div>
  <main
    v-else
    class="min-h-dvh flex items-center justify-center p-6 bg-default"
  >
    <EmptyState
      icon="i-lucide-store"
      :title="data?.state === 'inactive' ? t('storefront.inactive') : t('storefront.notFound')"
      :description="data?.state === 'inactive' ? t('storefront.inactiveBody') : t('storefront.notFoundBody')"
      :action="data?.state === 'inactive' ? undefined : { label: t('storefront.createOwn'), to: `${siteUrl}/app/auth/register?ref=etalase-404`, icon: 'i-lucide-sparkles' }"
    />
  </main>
</template>
