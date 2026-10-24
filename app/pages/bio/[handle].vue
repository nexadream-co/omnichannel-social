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
const registerUrl = `${siteUrl}/app/auth/register?ref=etalase&from=${encodeURIComponent(handle)}`
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

// The creator's accent tints the header; product cards get a hairline instead of a shadow.
const HEADER_CSS = '.sf-cover{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 22%,var(--bg)) 0%,var(--bg) 100%)}.sf-line{border:1px solid color-mix(in srgb,var(--text) 9%,transparent)}'

useHead(() => ({
  title: page.value ? `${page.value.title} · Etalase` : t('storefront.notFound'),
  htmlAttrs: { lang: 'id' },
  meta: [
    { name: 'description', content: page.value?.bio ?? '' },
    { name: 'robots', content: page.value?.indexable ? 'index,follow' : 'noindex' },
    { property: 'og:title', content: page.value?.title ?? '' },
    { property: 'og:image', content: page.value?.avatarUrl ?? '' }
  ],
  style: [{ innerHTML: HEADER_CSS + BUY_CSS + tabCss.value }]
}))
</script>

<template>
  <div
    v-if="page"
    class="sf min-h-dvh"
    :style="{ '--bg': page.theme.background, '--card': page.theme.card, '--text': page.theme.text, '--muted': page.theme.muted, '--accent': page.theme.accent, '--accent-text': page.theme.accentText, 'background': 'var(--bg)', 'color': 'var(--text)' }"
  >
    <header class="sf-cover px-4 pt-10 pb-6 text-center">
      <img
        v-if="page.avatarUrl"
        :src="page.avatarUrl"
        :alt="page.title"
        width="104"
        height="104"
        class="mx-auto size-26 rounded-full object-cover ring-4"
        style="--tw-ring-color: var(--card)"
        fetchpriority="high"
      >
      <div
        v-else
        class="mx-auto size-26 rounded-full flex items-center justify-center text-4xl font-bold ring-4"
        style="background: var(--accent); color: var(--accent-text); --tw-ring-color: var(--card)"
      >
        {{ page.title.slice(0, 1).toUpperCase() }}
      </div>
      <h1 class="mt-4 text-2xl font-bold tracking-tight text-balance">
        {{ page.title }}
      </h1>
      <p
        v-if="page.bio"
        class="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed whitespace-pre-line text-pretty"
        style="color: var(--muted)"
      >
        {{ page.bio }}
      </p>
      <nav
        v-if="Object.keys(page.socials).length"
        class="mt-4 flex flex-wrap justify-center gap-2"
      >
        <a
          v-for="(value, key) in page.socials"
          :key="key"
          :href="SOCIAL_URL[key]?.(value)"
          rel="nofollow noopener"
          target="_blank"
          :aria-label="key"
          class="sf-line grid size-10 place-items-center rounded-full motion-safe:transition-transform motion-safe:active:scale-95"
          style="background: var(--card)"
        >
          <UIcon
            :name="SOCIAL_ICON[key] ?? 'i-lucide-link'"
            class="size-[18px]"
          />
        </a>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-md px-4 pb-10 sm:max-w-3xl">
      <div class="mx-auto max-w-md">
        <form
          method="get"
          class="relative"
          role="search"
        >
          <UIcon
            name="i-lucide-search"
            class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2"
            style="color: var(--muted)"
          />
          <input
            name="q"
            :value="route.query.q ?? ''"
            type="search"
            :placeholder="t('storefront.search')"
            :aria-label="t('storefront.search')"
            class="sf-line w-full rounded-full py-3 pl-10 pr-4 text-sm outline-none focus:ring-2"
            style="background: var(--card); color: var(--text); --tw-ring-color: var(--accent)"
          >
        </form>

        <div
          v-if="page.categories.length"
          class="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
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
            class="sf-line shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium"
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
              class="sf-line shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium"
              style="background: var(--card)"
            >{{ category.name }}</label>
          </template>
        </div>
      </div>

      <div
        v-if="!items.length"
        class="mt-12 flex flex-col items-center gap-3 text-center text-sm"
        style="color: var(--muted)"
      >
        <span
          class="sf-line grid size-12 place-items-center rounded-full"
          style="background: var(--card)"
        >
          <UIcon
            :name="query ? 'i-lucide-search-x' : 'i-lucide-shopping-bag'"
            class="size-5"
            style="color: var(--accent)"
          />
        </span>
        {{ query ? t('storefront.noResults') : t('storefront.empty') }}
      </div>
      <template v-else>
        <p
          class="mt-6 mb-3 text-center text-xs font-medium"
          style="color: var(--muted)"
        >
          {{ query ? t('storefront.resultCount', { n: items.length }) : t('storefront.productCount', { n: items.length }) }}
        </p>
        <!-- Rows are centred, so one or two products sit under the header instead of in the left column. -->
        <ul class="flex flex-wrap justify-center gap-3 sm:gap-4">
          <li
            v-for="item in items"
            :key="item.id"
            class="sf-item sf-line w-[calc(50%-0.375rem)] sm:w-[calc((100%-2rem)/3)] rounded-lg overflow-hidden flex flex-col"
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
                  class="absolute inset-0 flex items-center justify-center text-4xl font-bold"
                  style="background: color-mix(in srgb, var(--accent) 14%, var(--card)); color: var(--accent)"
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
                  class="absolute top-2 left-2 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style="background: var(--accent); color: var(--accent-text)"
                >{{ item.badge || t('storefront.pinned') }}</span>
              </div>
              <div class="p-3 flex flex-col gap-1 flex-1">
                <span
                  class="flex items-center gap-1.5 text-[11px] font-medium"
                  style="color: var(--muted)"
                >
                  <span
                    class="size-1.5 rounded-full"
                    :style="{ background: MERCHANT_META[item.merchant].color, boxShadow: '0 0 0 1px color-mix(in srgb, var(--text) 20%, transparent)' }"
                  />
                  {{ MERCHANT_META[item.merchant].label }}
                </span>
                <span class="text-sm leading-snug line-clamp-2">{{ item.title }}</span>
                <span
                  v-if="item.priceIdr"
                  class="text-[15px] font-bold"
                >{{ priceFormat.format(item.priceIdr).replace(/\u00A0/g, ' ') }}</span>
                <span class="mt-auto pt-2">
                  <span
                    class="sf-buy flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold motion-safe:transition-transform motion-safe:active:scale-[0.97]"
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
      </template>

      <!-- Socialz.id identity on every Etalase: who made the page, and a way for visitors to make their own. -->
      <aside
        class="sf-line mx-auto mt-12 max-w-md rounded-lg p-5 text-center"
        style="background: var(--card)"
      >
        <a
          :href="`${siteUrl}/?ref=etalase`"
          rel="noopener"
          class="inline-flex items-center gap-2 font-bold"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            class="size-7"
            aria-hidden="true"
          ><rect
            width="64"
            height="64"
            rx="14"
            fill="#e6114f"
          /><path
            d="M41.5 22.6c-1.7-2.6-4.9-4.1-8.9-4.1-5.6 0-9.4 2.9-9.4 7.2 0 4 2.8 5.8 8.2 7l2.6.6c3.3.7 4.6 1.6 4.6 3.4 0 2-2.1 3.4-5.3 3.4-3.1 0-5.3-1.3-6.4-3.6l-4.6 2.3c1.8 3.9 5.7 6.1 10.9 6.1 6.2 0 10.4-3.1 10.4-7.8 0-4-2.6-6-8.3-7.2l-2.7-.6c-3-.7-4.1-1.4-4.1-3 0-1.7 1.7-2.8 4.3-2.8 2.4 0 4.2 1 5.2 2.8z"
            fill="#fff"
          /></svg>
          Socialz.id
        </a>
        <p class="mt-3 text-sm font-semibold">
          {{ t('storefront.ctaTitle') }}
        </p>
        <p
          class="mt-1 text-sm text-pretty"
          style="color: var(--muted)"
        >
          {{ t('storefront.ctaBody') }}
        </p>
        <a
          :href="registerUrl"
          rel="noopener"
          class="mt-4 inline-flex w-full items-center justify-center rounded-md py-2.5 text-sm font-semibold motion-safe:transition-transform motion-safe:active:scale-[0.98] sm:w-auto sm:px-6"
          style="background: var(--text); color: var(--bg)"
        >{{ t('storefront.createOwn') }}</a>
      </aside>
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
