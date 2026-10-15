<script setup lang="ts">
import { MERCHANT_META, type Merchant } from '#shared/utils/links'

export interface LinkRow {
  id: string
  destinationUrl: string
  merchant: Merchant
  title: string | null
  imageUrl: string | null
  priceIdr: number | null
  archived: boolean
  slug: string | null
  shortUrl: string | null
  clicks7d: number
}

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const entitlements = useEntitlements()
useHead({ title: () => t('links.title') })

const showArchived = ref(false)
const filters = computed(() => ({ archived: showArchived.value ? 'true' : 'false' }))
const list = useServerList<LinkRow>('/api/app/links', { filters, limit: 24 })
onMounted(async () => {
  await list.refresh()
  await entitlements.load()
})

const open = ref(false)
const saving = ref(false)
const form = reactive({ destinationUrl: '', title: '', priceIdr: null as number | null, showInBio: true, customSlug: '' })

function openAdd() {
  Object.assign(form, { destinationUrl: '', title: '', priceIdr: null, showInBio: true, customSlug: '' })
  open.value = true
}

/** After saving, the autofill job fills title/photo/price within seconds: refresh the card a few times. */
async function watchFill(id: string) {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    const link = await apiFetch<LinkRow>(`/api/app/links/${id}`).catch(() => null)
    if (!link) return
    list.items.value = list.items.value.map(row => row.id === id ? { ...row, ...link, clicks7d: row.clicks7d } : row)
    if (link.title && link.imageUrl) return
  }
}

async function save() {
  saving.value = true
  try {
    const result = await apiFetch<{ link: LinkRow, customIgnored: boolean }>('/api/app/links', {
      method: 'POST',
      body: { destinationUrl: form.destinationUrl.trim(), title: form.title || undefined, priceIdr: form.priceIdr || undefined, showInBio: form.showInBio, customSlug: form.customSlug || undefined }
    })
    open.value = false
    toast.add({ title: result.customIgnored ? t('links.customIgnored') : t('links.created'), color: result.customIgnored ? 'warning' : 'success' })
    await list.refresh()
    if (!result.link.title || !result.link.imageUrl) void watchFill(result.link.id)
  } catch (caught) {
    if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function copy(link: LinkRow) {
  if (link.shortUrl && await copyText(link.shortUrl)) toast.add({ title: t('links.copied'), color: 'success' })
}

async function toggleArchive(link: LinkRow) {
  await apiFetch(`/api/app/links/${link.id}`, { method: 'PATCH', body: { archived: !link.archived } })
  await list.refresh()
}
</script>

<template>
  <div class="w-full max-w-5xl mx-auto">
    <CommandBar
      :title="t('links.title')"
      :description="t('links.subtitle')"
    >
      <UButton
        icon="i-lucide-plus"
        :label="t('links.add')"
        @click="openAdd"
      />
    </CommandBar>
    <div class="flex flex-wrap gap-3 items-center mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        :placeholder="t('links.search')"
        class="flex-1 min-w-48"
      />
      <USwitch
        v-model="showArchived"
        :label="t('links.showArchived')"
      />
    </div>

    <div
      v-if="list.status.value === 'loading' && !list.items.value.length"
      class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <USkeleton
        v-for="n in 6"
        :key="n"
        class="h-56 w-full"
      />
    </div>
    <UCard
      v-else-if="!list.items.value.length"
      class="text-center"
    >
      <UIcon
        name="i-lucide-link"
        class="size-8 text-muted mx-auto"
      />
      <p class="mt-3 text-default">
        {{ t('links.empty') }}
      </p>
      <UButton
        icon="i-lucide-plus"
        :label="t('links.add')"
        class="mt-4"
        @click="openAdd"
      />
    </UCard>
    <div
      v-else
      class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="link in list.items.value"
        :key="link.id"
        :ui="{ body: 'p-0 sm:p-0' }"
        class="overflow-hidden"
      >
        <NuxtLink
          :to="localePath(`/app/links/${link.id}`)"
          class="block aspect-[4/3] bg-elevated"
        >
          <img
            v-if="link.imageUrl"
            :src="link.imageUrl"
            :alt="link.title ?? ''"
            class="size-full object-cover"
            loading="lazy"
          >
          <div
            v-else
            class="size-full flex flex-col items-center justify-center gap-1 text-xs text-muted"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-5 animate-spin"
            />
            {{ t('links.filling') }}
          </div>
        </NuxtLink>
        <div class="p-3 space-y-2">
          <div class="flex items-center gap-2">
            <span
              class="text-xs font-medium px-1.5 py-0.5 rounded text-white"
              :style="{ background: MERCHANT_META[link.merchant].color }"
            >{{ MERCHANT_META[link.merchant].label }}</span>
            <UBadge
              v-if="link.archived"
              color="neutral"
              variant="subtle"
              size="sm"
              :label="t('links.archived')"
            />
            <span class="ml-auto text-xs text-muted">{{ t('links.clicks7d', { n: link.clicks7d }) }}</span>
          </div>
          <p class="text-sm font-medium text-highlighted line-clamp-2 min-h-10">
            {{ link.title || link.destinationUrl }}
          </p>
          <p
            v-if="link.priceIdr"
            class="text-sm text-default"
          >
            {{ formatIDR(link.priceIdr, locale) }}
          </p>
          <div class="flex items-center gap-1">
            <UButton
              size="sm"
              icon="i-lucide-copy"
              variant="soft"
              :label="t('links.copy')"
              class="flex-1 justify-center"
              @click="copy(link)"
            />
            <UButton
              size="sm"
              icon="i-lucide-chart-column"
              color="neutral"
              variant="ghost"
              :to="localePath(`/app/links/${link.id}`)"
              :aria-label="t('links.stats')"
            />
            <UButton
              size="sm"
              :icon="link.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
              color="neutral"
              variant="ghost"
              :aria-label="link.archived ? t('links.unarchive') : t('links.archive')"
              @click="toggleArchive(link)"
            />
          </div>
        </div>
      </UCard>
    </div>
    <div
      v-if="list.pageCount.value > 1"
      class="flex justify-center mt-4"
    >
      <UPagination
        v-model:page="list.page.value"
        :total="list.total.value"
        :items-per-page="list.limit.value"
      />
    </div>

    <FormSlideover
      v-model:open="open"
      :title="t('links.addTitle')"
      :loading="saving"
      :submit-label="t('links.add')"
      @submit="save"
    >
      <div class="space-y-4">
        <UFormField
          :label="t('links.paste')"
          :description="t('links.pasteHint')"
          required
        >
          <UInput
            v-model="form.destinationUrl"
            type="url"
            inputmode="url"
            placeholder="https://s.shopee.co.id/…"
            class="w-full"
            size="lg"
            autofocus
          />
        </UFormField>
        <USwitch
          v-model="form.showInBio"
          :label="t('links.showInBio')"
        />
        <UCollapsible>
          <UButton
            color="neutral"
            variant="ghost"
            block
            class="justify-between px-0"
            :label="t('links.advanced')"
            trailing-icon="i-lucide-chevron-down"
          />
          <template #content>
            <div class="space-y-4 pt-3">
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
              <UFormField
                :label="t('links.customSlug')"
                :description="t('links.customSlugHint')"
              >
                <UInput
                  v-model="form.customSlug"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>
        </UCollapsible>
      </div>
    </FormSlideover>
  </div>
</template>
