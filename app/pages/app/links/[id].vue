<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { MERCHANT_META } from '#shared/utils/links'
import type { LinkRow } from './index.vue'

interface Stats {
  window: { days: number, requestedDays: number, clamped: boolean, today: string }
  totals: { clicks: number, uniques: number }
  daily: { day: string, clicks: number }[]
  bySource: { source: string, channel: string | null, clicks: number }[]
  devices: { device: string, clicks: number }[]
  cities: { city: string, clicks: number }[]
}

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const toast = useToast()
const route = useRoute()
const id = String(route.params.id)
useHead({ title: () => t('links.stats') })

const link = ref<LinkRow | null>(null)
const stats = ref<Stats | null>(null)
const days = ref<7 | 30 | 90>(7)
const form = reactive({ title: '', priceIdr: null as number | null })
const saving = ref(false)

async function loadStats() {
  stats.value = await apiFetch<Stats>(`/api/app/links/${id}/stats`, { query: { days: days.value } })
}
onMounted(async () => {
  link.value = await apiFetch<LinkRow>(`/api/app/links/${id}`)
  Object.assign(form, { title: link.value.title ?? '', priceIdr: link.value.priceIdr })
  await loadStats()
})
watch(days, loadStats)

async function save() {
  saving.value = true
  try {
    link.value = await apiFetch<LinkRow>(`/api/app/links/${id}`, { method: 'PATCH', body: { title: form.title || null, priceIdr: form.priceIdr || null } })
    toast.add({ title: t('links.saved'), color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function copy() {
  if (link.value?.shortUrl && await copyText(link.value.shortUrl)) toast.add({ title: t('links.copied'), color: 'success' })
}

function sourceLabel(row: { source: string, channel: string | null }) {
  const source = t(`analytics.source.${row.source}`)
  return row.channel && row.channel in PLATFORM_META ? `${source} · ${PLATFORM_META[row.channel as Platform].name}` : source
}
const ranges = computed(() => ([7, 30, 90] as const).map(value => ({ value, label: t(`analytics.range.${value}`) })))
</script>

<template>
  <div class="w-full max-w-3xl mx-auto space-y-5">
    <CommandBar :title="t('links.stats')" />
    <UCard v-if="link">
      <div class="flex gap-4">
        <div class="size-20 shrink-0 rounded-md overflow-hidden bg-elevated">
          <img
            v-if="link.imageUrl"
            :src="link.imageUrl"
            alt=""
            class="size-full object-cover"
          >
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <span
            class="text-xs font-medium px-1.5 py-0.5 rounded text-white"
            :style="{ background: MERCHANT_META[link.merchant].color }"
          >{{ MERCHANT_META[link.merchant].label }}</span>
          <p class="font-medium text-highlighted line-clamp-2">
            {{ link.title || link.destinationUrl }}
          </p>
          <p class="text-sm text-primary truncate">
            {{ link.shortUrl }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <UButton
          icon="i-lucide-copy"
          :label="t('links.copy')"
          @click="copy"
        />
        <UButton
          icon="i-lucide-qr-code"
          variant="outline"
          :label="t('links.qr')"
          @click="link.shortUrl && downloadQr(link.shortUrl, `qr-${link.slug}`)"
        />
      </div>
      <USeparator class="my-4" />
      <form
        class="grid sm:grid-cols-[1fr_12rem_auto] gap-3 items-end"
        @submit.prevent="save"
      >
        <UFormField :label="t('links.productTitle')">
          <UInput
            v-model="form.title"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('links.price')">
          <UInputNumber
            v-model="form.priceIdr"
            :min="0"
            :step="1000"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          :loading="saving"
          :label="t('bio.save')"
        />
      </form>
    </UCard>

    <UCard v-if="stats">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div class="flex gap-6">
          <div>
            <p class="text-2xl font-semibold text-highlighted">
              {{ formatCompact(stats.totals.clicks, locale) }}
            </p>
            <p class="text-xs text-muted">
              {{ t('analytics.clicks') }}
            </p>
          </div>
          <div>
            <p class="text-2xl font-semibold text-highlighted">
              {{ formatCompact(stats.totals.uniques, locale) }}
            </p>
            <p class="text-xs text-muted">
              {{ t('analytics.uniques') }}
            </p>
          </div>
        </div>
        <USelect
          v-model="days"
          :items="ranges"
          class="w-32"
        />
      </div>
      <UAlert
        v-if="stats.window.clamped"
        color="info"
        variant="subtle"
        class="mb-4"
        :title="t('analytics.clamped', { days: stats.window.days })"
      />
      <ClickBars
        :daily="stats.daily"
        :days="stats.window.days"
        :today="stats.window.today"
      />
      <div class="grid sm:grid-cols-3 gap-4 mt-6 text-sm">
        <div>
          <p class="font-medium mb-2">
            {{ t('analytics.bySource') }}
          </p>
          <p
            v-for="row in stats.bySource"
            :key="`${row.source}${row.channel}`"
            class="flex justify-between gap-2 py-0.5"
          >
            <span class="text-muted truncate">{{ sourceLabel(row) }}</span><span>{{ row.clicks }}</span>
          </p>
        </div>
        <div>
          <p class="font-medium mb-2">
            {{ t('analytics.devices') }}
          </p>
          <p
            v-for="row in stats.devices"
            :key="row.device"
            class="flex justify-between gap-2 py-0.5"
          >
            <span class="text-muted">{{ t(`analytics.device.${row.device}`, row.device) }}</span><span>{{ row.clicks }}</span>
          </p>
        </div>
        <div>
          <p class="font-medium mb-2">
            {{ t('analytics.cities') }}
          </p>
          <p
            v-for="row in stats.cities"
            :key="row.city"
            class="flex justify-between gap-2 py-0.5"
          >
            <span class="text-muted truncate">{{ row.city }}</span><span>{{ row.clicks }}</span>
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>
