<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { MERCHANT_META, type Merchant } from '#shared/utils/links'

interface Analytics {
  window: { days: number, requestedDays: number, clamped: boolean, today: string }
  totals: { clicks: number, uniques: number }
  daily: { day: string, clicks: number }[]
  topLinks: { linkId: string, title: string | null, merchant: Merchant, imageUrl: string | null, clicks: number }[]
  bySource: { source: string, clicks: number }[]
  byChannel: { channel: string, clicks: number }[]
  topPosts: { postId: string, caption: string, platform: Platform, clicks: number }[]
  devices: { device: string, clicks: number }[]
  cities: { city: string, clicks: number }[]
}

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('analytics.title') })

const days = ref<7 | 30 | 90>(7)
const data = ref<Analytics | null>(null)
async function load() {
  data.value = await apiFetch<Analytics>('/api/app/analytics', { query: { days: days.value } })
}
onMounted(load)
watch(days, load)
const ranges = computed(() => ([7, 30, 90] as const).map(value => ({ value, label: t(`analytics.range.${value}`) })))

const channelLabel = (channel: string) => channel in PLATFORM_META ? PLATFORM_META[channel as Platform].name : t('analytics.channel.other')
const share = (clicks: number) => data.value?.totals.clicks ? Math.round((clicks / data.value.totals.clicks) * 100) : 0
const breakdowns = computed(() => data.value
  ? [
      { key: 'source', title: t('analytics.bySource'), rows: data.value.bySource.map(r => ({ key: r.source, label: t(`analytics.source.${r.source}`), clicks: r.clicks })) },
      { key: 'channel', title: t('analytics.byPlatform'), rows: data.value.byChannel.map(r => ({ key: r.channel, label: channelLabel(r.channel), clicks: r.clicks })) },
      { key: 'device', title: t('analytics.devices'), rows: data.value.devices.map(r => ({ key: r.device, label: t(`analytics.device.${r.device}`, r.device), clicks: r.clicks })) },
      { key: 'city', title: t('analytics.cities'), rows: data.value.cities.map(r => ({ key: r.city, label: r.city, clicks: r.clicks })) }
    ].map(group => ({ ...group, rows: [...group.rows].sort((a, b) => b.clicks - a.clicks) }))
  : [])
</script>

<template>
  <div class="w-full max-w-5xl mx-auto space-y-5">
    <CommandBar
      :title="t('analytics.title')"
      :description="t('analytics.subtitle')"
    >
      <USelect
        v-model="days"
        :items="ranges"
        class="w-32"
      />
    </CommandBar>

    <div
      v-if="!data"
      class="space-y-4"
    >
      <USkeleton class="h-48 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>
    <template v-else>
      <UAlert
        v-if="data.window.clamped"
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        :title="t('analytics.clamped', { days: data.window.days })"
      />
      <UCard>
        <div class="flex gap-8 mb-4">
          <div>
            <p class="text-3xl font-semibold text-highlighted">
              {{ formatCompact(data.totals.clicks, locale) }}
            </p>
            <p class="text-sm text-muted">
              {{ t('analytics.clicks') }}
            </p>
          </div>
          <div>
            <p class="text-3xl font-semibold text-highlighted">
              {{ formatCompact(data.totals.uniques, locale) }}
            </p>
            <p class="text-sm text-muted">
              {{ t('analytics.uniques') }}
            </p>
          </div>
        </div>
        <p class="text-sm font-medium mb-2">
          {{ t('analytics.daily') }}
        </p>
        <ClickBars
          :daily="data.daily"
          :days="data.window.days"
          :today="data.window.today"
        />
        <p
          v-if="!data.totals.clicks"
          class="mt-4 text-sm text-muted text-center"
        >
          {{ t('analytics.empty') }}
        </p>
      </UCard>

      <div
        v-if="data.totals.clicks"
        class="grid gap-5 lg:grid-cols-2"
      >
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              {{ t('analytics.topProducts') }}
            </h2>
          </template>
          <ol class="space-y-3">
            <li
              v-for="row in data.topLinks"
              :key="row.linkId"
            >
              <NuxtLink
                :to="localePath(`/app/links/${row.linkId}`)"
                class="flex items-center gap-3 group"
              >
                <img
                  v-if="row.imageUrl"
                  :src="row.imageUrl"
                  alt=""
                  class="size-10 rounded object-cover shrink-0"
                >
                <div
                  v-else
                  class="size-10 rounded bg-elevated shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-default truncate group-hover:text-primary">
                    {{ row.title || MERCHANT_META[row.merchant].label }}
                  </p>
                  <p
                    class="text-xs"
                    :style="{ color: MERCHANT_META[row.merchant].color }"
                  >
                    {{ MERCHANT_META[row.merchant].label }}
                  </p>
                </div>
                <span class="text-sm font-semibold text-highlighted">{{ row.clicks }}</span>
              </NuxtLink>
            </li>
          </ol>
        </UCard>
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              {{ t('analytics.topPosts') }}
            </h2>
          </template>
          <p
            v-if="!data.topPosts.length"
            class="text-sm text-muted"
          >
            {{ t('analytics.noPostClicks') }}
          </p>
          <ol
            v-else
            class="space-y-3"
          >
            <li
              v-for="row in data.topPosts"
              :key="`${row.postId}${row.platform}`"
              class="flex items-center gap-3"
            >
              <UIcon
                :name="PLATFORM_META[row.platform].icon"
                class="size-5 shrink-0 text-muted"
              />
              <p class="text-sm text-default line-clamp-2 flex-1 min-w-0">
                {{ row.caption }}
              </p>
              <span class="text-sm font-semibold text-highlighted">{{ row.clicks }}</span>
            </li>
          </ol>
        </UCard>
      </div>

      <div
        v-if="data.totals.clicks"
        class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <UCard
          v-for="group in breakdowns"
          :key="group.key"
        >
          <p class="text-sm font-medium text-highlighted mb-3">
            {{ group.title }}
          </p>
          <p
            v-if="!group.rows.length"
            class="text-sm text-muted"
          >
            —
          </p>
          <ul
            v-else
            class="space-y-2.5"
          >
            <li
              v-for="row in group.rows"
              :key="row.key"
              class="text-sm"
            >
              <div class="flex justify-between gap-2">
                <span class="text-muted truncate">{{ row.label }}</span>
                <span class="text-default">{{ row.clicks }}</span>
              </div>
              <div class="mt-1 h-1.5 rounded-full bg-elevated overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${share(row.clicks)}%` }"
                />
              </div>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </div>
</template>
