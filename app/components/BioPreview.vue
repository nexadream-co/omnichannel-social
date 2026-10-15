<script setup lang="ts">
import { MERCHANT_META, type Merchant } from '#shared/utils/links'

/** Phone-sized mirror of the public Etalase (app/pages/bio/[handle].vue), rendered from unsaved editor values. */
defineProps<{
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
</script>

<template>
  <div class="mx-auto w-full max-w-[340px] rounded-[2rem] border-8 border-neutral-800 dark:border-neutral-700 overflow-hidden shadow-xl">
    <div
      class="h-[600px] overflow-y-auto px-3 py-6"
      :style="{ background: theme.background, color: theme.text }"
    >
      <div class="text-center space-y-2">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          alt=""
          class="mx-auto size-16 rounded-full object-cover"
        >
        <div
          v-else
          class="mx-auto size-16 rounded-full flex items-center justify-center text-2xl font-bold"
          :style="{ background: theme.accent, color: theme.accentText }"
        >
          {{ title.slice(0, 1).toUpperCase() }}
        </div>
        <p class="font-bold">
          {{ title }}
        </p>
        <p
          v-if="bio"
          class="text-xs whitespace-pre-line"
          :style="{ color: theme.muted }"
        >
          {{ bio }}
        </p>
        <div class="flex justify-center gap-2.5">
          <template
            v-for="(value, key) in socials"
            :key="key"
          >
            <UIcon
              v-if="value"
              :name="icons[key] ?? 'i-lucide-link'"
              class="size-4"
            />
          </template>
        </div>
      </div>
      <div
        class="mt-4 rounded-full px-3 py-2 text-xs"
        :style="{ background: theme.card, color: theme.muted }"
      >
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
      <p
        v-if="!items.length"
        class="mt-8 text-center text-xs"
        :style="{ color: theme.muted }"
      >
        {{ t('storefront.empty') }}
      </p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <div
          v-for="item in items"
          :key="item.id"
          class="rounded-lg overflow-hidden"
          :style="{ background: theme.card }"
        >
          <div class="relative aspect-square bg-black/5">
            <img
              v-if="item.imageUrl"
              :src="item.imageUrl"
              alt=""
              class="size-full object-cover"
            >
            <span
              v-if="item.badge || item.pinned"
              class="absolute top-1.5 left-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
              :style="{ background: theme.accent, color: theme.accentText }"
            >{{ item.badge || '★' }}</span>
          </div>
          <div class="p-2 space-y-0.5">
            <p
              v-if="item.merchant"
              class="text-[10px] font-medium"
              :style="{ color: MERCHANT_META[item.merchant].color }"
            >
              {{ MERCHANT_META[item.merchant].label }}
            </p>
            <p class="text-xs leading-snug line-clamp-2">
              {{ item.title }}
            </p>
            <p
              v-if="item.priceIdr"
              class="text-xs font-semibold"
            >
              {{ formatIDR(item.priceIdr, locale) }}
            </p>
            <p
              class="mt-1 text-center rounded-md py-1 text-xs font-semibold"
              :style="{ background: theme.accent, color: theme.accentText }"
            >
              {{ t('storefront.buy') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
