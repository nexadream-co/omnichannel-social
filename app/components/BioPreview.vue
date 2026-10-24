<script setup lang="ts">
import { MERCHANT_META, type Merchant } from '#shared/utils/links'

/** Phone-sized mirror of the public Etalase (app/pages/bio/[handle].vue), rendered from unsaved editor values. */
const props = defineProps<{
  theme: { background: string, card: string, text: string, muted: string, accent: string, accentText: string }
  title: string
  bio: string
  avatarUrl: string | null
  socials: Record<string, string | undefined>
  icons: Record<string, string>
  categories: { id: string, name: string }[]
  items: { id: string, title: string | null, imageUrl: string | null, priceIdr: number | null, merchant: Merchant | null, badge: string | null, pinned: boolean }[]
}>()
const { t, locale } = useI18n()

// A brief ring on the part that just changed, so the creator sees where the edit landed.
const flash = ref<Record<string, boolean>>({})
const timers: Record<string, ReturnType<typeof setTimeout>> = {}
function pulse(section: string) {
  flash.value = { ...flash.value, [section]: true }
  clearTimeout(timers[section])
  timers[section] = setTimeout(() => {
    flash.value = { ...flash.value, [section]: false }
  }, 600)
}
watch(() => [props.title, props.avatarUrl], () => pulse('title'))
// A broken avatar URL falls back to the themed initial below.
const avatarFailed = ref(false)
watch(() => props.avatarUrl, () => {
  avatarFailed.value = false
})
watch(() => props.bio, () => pulse('bio'))
watch(() => props.socials, () => pulse('socials'), { deep: true })
watch(() => props.items.map(item => `${item.id}:${item.title}:${item.badge}:${item.pinned}:${item.priceIdr}`).join('|'), () => pulse('items'))
onScopeDispose(() => Object.values(timers).forEach(clearTimeout))
// The hairline the public page draws around cards (.sf-line).
const line = computed(() => `1px solid color-mix(in srgb, ${props.theme.text} 9%, transparent)`)
const ring = (section: string) => flash.value[section] ? 'ring-2 ring-primary/40' : 'ring-0 ring-transparent'
</script>

<template>
  <div class="mx-auto w-full max-w-[340px] rounded-[2rem] border-8 border-neutral-800 dark:border-neutral-700 overflow-hidden shadow-xl">
    <div
      class="h-[600px] overflow-y-auto pb-6 motion-safe:transition-colors motion-safe:duration-200"
      :style="{ background: theme.background, color: theme.text }"
    >
      <div
        class="px-3 pt-6 pb-4 text-center space-y-2"
        :style="{ background: `linear-gradient(180deg, color-mix(in srgb, ${theme.accent} 22%, ${theme.background}) 0%, ${theme.background} 100%)` }"
      >
        <div
          class="rounded-xl p-1 motion-safe:transition-shadow"
          :class="ring('title')"
        >
          <img
            v-if="avatarUrl && !avatarFailed"
            :src="avatarUrl"
            alt=""
            class="mx-auto size-16 rounded-full object-cover ring-2"
            :style="{ '--tw-ring-color': theme.card }"
            @error="avatarFailed = true"
          >
          <div
            v-else
            class="mx-auto size-16 rounded-full flex items-center justify-center text-2xl font-bold motion-safe:transition-colors motion-safe:duration-200"
            :style="{ background: theme.accent, color: theme.accentText }"
          >
            {{ title.slice(0, 1).toUpperCase() }}
          </div>
          <p class="mt-2 font-bold">
            {{ title }}
          </p>
        </div>
        <p
          v-if="bio"
          class="rounded-md text-xs whitespace-pre-line motion-safe:transition-shadow"
          :class="ring('bio')"
          :style="{ color: theme.muted }"
        >
          {{ bio }}
        </p>
        <div
          class="flex justify-center gap-2.5 rounded-md motion-safe:transition-shadow"
          :class="ring('socials')"
        >
          <template
            v-for="(value, key) in socials"
            :key="key"
          >
            <span
              v-if="value"
              class="grid size-7 place-items-center rounded-full"
              :style="{ background: theme.card, border: line }"
            >
              <UIcon
                :name="icons[key] ?? 'i-lucide-link'"
                class="size-3.5"
              />
            </span>
          </template>
        </div>
      </div>
      <div class="px-3">
        <div
          class="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs"
          :style="{ background: theme.card, color: theme.muted, border: line }"
        >
          <UIcon
            name="i-lucide-search"
            class="size-3.5"
          />
          {{ t('storefront.search') }}
        </div>
        <div
          v-if="categories.length"
          class="mt-3 flex gap-1.5 overflow-x-auto"
        >
          <span
            class="shrink-0 rounded-full px-2.5 py-1 text-xs"
            :style="{ background: theme.accent, color: theme.accentText }"
          >{{ t('storefront.all') }}</span>
          <span
            v-for="category in categories"
            :key="category.id"
            class="shrink-0 rounded-full px-2.5 py-1 text-xs"
            :style="{ background: theme.card }"
          >{{ category.name }}</span>
        </div>
        <div
          v-if="!items.length"
          class="mt-8 flex flex-col items-center gap-2 text-center text-xs"
          :style="{ color: theme.muted }"
        >
          <span
            class="grid size-10 place-items-center rounded-full"
            :style="{ background: theme.card }"
          >
            <UIcon
              name="i-lucide-shopping-bag"
              class="size-5"
              :style="{ color: theme.accent }"
            />
          </span>
          {{ t('storefront.empty') }}
        </div>
        <p
          v-if="items.length"
          class="mt-4 text-[10px] font-medium"
          :style="{ color: theme.muted }"
        >
          {{ t('storefront.productCount', { n: items.length }) }}
        </p>
        <div
          class="mt-2 grid grid-cols-2 gap-2 rounded-lg motion-safe:transition-shadow"
          :class="ring('items')"
        >
          <div
            v-for="item in items"
            :key="item.id"
            class="rounded-xl overflow-hidden"
            :style="{ background: theme.card, border: line }"
          >
            <div class="relative aspect-square">
              <SmartImage
                :src="item.imageUrl"
                :title="item.title"
                :merchant="item.merchant"
                kind="product"
                class="size-full"
              />
              <span
                v-if="item.badge || item.pinned"
                class="absolute top-1.5 left-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
                :style="{ background: theme.accent, color: theme.accentText }"
              >{{ item.badge || t('storefront.pinned') }}</span>
            </div>
            <div class="p-2 space-y-0.5">
              <p
                v-if="item.merchant"
                class="flex items-center gap-1 text-[10px] font-medium"
                :style="{ color: theme.muted }"
              >
                <span
                  class="size-1.5 rounded-full"
                  :style="{ background: MERCHANT_META[item.merchant].color, boxShadow: `0 0 0 1px color-mix(in srgb, ${theme.text} 20%, transparent)` }"
                />
                {{ MERCHANT_META[item.merchant].label }}
              </p>
              <p class="text-xs leading-snug line-clamp-2">
                {{ item.title }}
              </p>
              <p
                v-if="item.priceIdr"
                class="text-xs font-bold"
              >
                {{ formatIDR(item.priceIdr, locale) }}
              </p>
              <p
                class="mt-1 text-center rounded-lg py-1 text-xs font-semibold"
                :style="{ background: theme.accent, color: theme.accentText }"
              >
                {{ t('storefront.buy') }}
              </p>
            </div>
          </div>
        </div>
        <div
          class="mt-6 rounded-xl p-3 text-center"
          :style="{ background: theme.card, border: line }"
        >
          <p class="inline-flex items-center gap-1.5 text-xs font-bold">
            <img
              src="/favicon.svg"
              alt=""
              class="size-4"
            >
            Socialz.id
          </p>
          <p
            class="mt-1 text-[10px]"
            :style="{ color: theme.muted }"
          >
            {{ t('storefront.ctaTitle') }}
          </p>
          <p
            class="mt-2 rounded-lg py-1.5 text-[11px] font-semibold"
            :style="{ background: theme.text, color: theme.background }"
          >
            {{ t('storefront.createOwn') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
