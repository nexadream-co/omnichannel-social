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
const undo = useUndoToast()
const { spark, haptic } = useCelebrate()
const { readClipboard, watchFill } = useAddProductLink()
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

async function pasteIntoForm() {
  const text = await readClipboard()
  if (text && /^https?:\/\//i.test(text.trim())) form.destinationUrl = text.trim()
  else toast.add({ title: t('links.pasteNothing'), color: 'warning' })
}
const canPaste = ref(false)
onMounted(() => {
  canPaste.value = typeof navigator.clipboard?.readText === 'function'
})

/** Fills the card as the autofill job delivers; a spark when the title and photo have both arrived. */
function fill(id: string, tries?: number) {
  void watchFill(id, (link) => {
    const before = list.items.value.find(row => row.id === id)
    list.items.value = list.items.value.map(row => row.id === id ? { ...row, ...link, clicks7d: row.clicks7d } : row)
    if (before && (!before.title || !before.imageUrl) && link.title && link.imageUrl) {
      haptic('tick')
      nextTick(() => {
        const el = document.getElementById(`link-${id}`)
        if (el) spark(el)
      })
    }
  }, tries)
}

const pendingUrl = ref<string | null>(null)
function onPasteStart(url: string) {
  pendingUrl.value = url
}
function onPasteDone(link: LinkRow, customIgnored: boolean) {
  pendingUrl.value = null
  if (customIgnored) toast.add({ title: t('links.customIgnored'), color: 'warning' })
  if (!list.items.value.some(row => row.id === link.id)) list.items.value = [{ ...link, clicks7d: link.clicks7d ?? 0 }, ...list.items.value]
  fill(link.id)
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
    if (!result.link.title || !result.link.imageUrl) fill(result.link.id)
  } catch (caught) {
    if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleArchive(link: LinkRow) {
  const snapshot = list.items.value
  const archive = !link.archived
  await undo.run({
    title: t(archive ? 'links.archivedToast' : 'links.restoredToast'),
    apply: () => {
      list.items.value = snapshot.filter(row => row.id !== link.id)
    },
    rollback: () => {
      list.items.value = snapshot
    },
    commit: () => apiFetch(`/api/app/links/${link.id}`, { method: 'PATCH', body: { archived: archive } }),
    undo: () => apiFetch(`/api/app/links/${link.id}`, { method: 'PATCH', body: { archived: !archive } })
  })
}

function menu(link: LinkRow) {
  return [[
    { label: t('links.stats'), icon: 'i-lucide-chart-column', to: localePath(`/app/links/${link.id}`) },
    { label: t('links.qr'), icon: 'i-lucide-qr-code', disabled: !link.shortUrl, onSelect: () => link.shortUrl && downloadQr(link.shortUrl, `qr-${link.slug}`) },
    { label: link.archived ? t('links.unarchive') : t('links.archive'), icon: link.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive', onSelect: () => toggleArchive(link) }
  ]]
}

function merchantOf(link: LinkRow) {
  return MERCHANT_META[link.merchant]
}
const clicksText = (n: number) => t('links.clicks7d', { n })
const searching = computed(() => Boolean(list.search.value.trim()) || showArchived.value)
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

    <LinkPasteField
      v-if="list.items.value.length || pendingUrl"
      class="mb-4"
      @start="onPasteStart"
      @done="onPasteDone"
      @fail="pendingUrl = null"
    />
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
      class="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <USkeleton
        v-for="n in 6"
        :key="n"
        class="h-[88px] sm:h-56 w-full"
      />
    </div>
    <EmptyState
      v-else-if="!list.items.value.length && !pendingUrl && searching"
      icon="i-lucide-search-x"
      :title="t('links.noResults')"
      compact
    />
    <EmptyState
      v-else-if="!list.items.value.length && !pendingUrl"
      icon="i-lucide-link"
      :title="t('links.emptyTitle')"
      :description="t('links.emptyBody')"
      :action="{ label: t('links.add'), icon: 'i-lucide-plus', onClick: openAdd }"
    >
      <LinkPasteField
        class="max-w-md"
        @start="onPasteStart"
        @done="onPasteDone"
        @fail="pendingUrl = null"
      />
    </EmptyState>
    <TransitionGroup
      v-else
      name="list"
      tag="div"
      class="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
    >
      <div
        v-if="pendingUrl"
        key="pending"
        class="flex gap-3 rounded-lg border border-default bg-default p-2 sm:flex-col sm:p-0 sm:overflow-hidden"
      >
        <div class="shimmer size-[72px] shrink-0 rounded-lg bg-elevated sm:aspect-[4/3] sm:size-auto sm:w-full sm:rounded-none" />
        <div class="min-w-0 flex-1 space-y-2 py-1 sm:p-3">
          <p class="text-xs text-muted">
            {{ t('links.filling') }}
          </p>
          <div class="shimmer h-4 w-3/4 rounded bg-elevated" />
          <p class="truncate text-xs text-dimmed">
            {{ pendingUrl }}
          </p>
        </div>
      </div>
      <div
        v-for="link in list.items.value"
        :id="`link-${link.id}`"
        :key="link.id"
        class="flex gap-3 rounded-lg border border-default bg-default p-2 sm:flex-col sm:p-0 sm:overflow-hidden"
      >
        <NuxtLink
          :to="localePath(`/app/links/${link.id}`)"
          class="shrink-0"
        >
          <SmartImage
            :src="link.imageUrl"
            :title="link.title"
            :alt="link.title ?? ''"
            :merchant="link.merchant"
            kind="product"
            class="size-[72px] rounded-lg sm:aspect-[4/3] sm:size-auto sm:w-full sm:rounded-none"
          />
        </NuxtLink>
        <div class="flex min-w-0 flex-1 flex-col gap-1 sm:p-3 sm:pt-0">
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ background: merchantOf(link).color }"
            />
            <span class="truncate">{{ merchantOf(link).label }}</span>
            <UBadge
              v-if="link.archived"
              color="neutral"
              variant="subtle"
              size="sm"
              :label="t('links.archived')"
            />
          </div>
          <NuxtLink
            :to="localePath(`/app/links/${link.id}`)"
            class="text-sm font-medium text-highlighted line-clamp-2 break-words"
          >
            {{ link.title || link.destinationUrl }}
          </NuxtLink>
          <p class="flex items-center gap-2 text-xs text-muted">
            <span
              v-if="link.priceIdr"
              class="text-sm text-default"
            >{{ formatIDR(link.priceIdr, locale) }}</span>
            <TickNumber
              :value="link.clicks7d"
              :format="clicksText"
            />
          </p>
          <p
            v-if="!link.title || !link.imageUrl"
            class="flex items-center gap-1 text-xs text-muted"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-3.5 motion-safe:animate-spin"
            />
            {{ t('links.filling') }}
          </p>
          <div class="hidden items-center gap-1 pt-1 sm:flex">
            <CopyButton
              v-if="link.shortUrl"
              :text="link.shortUrl"
              :label="t('links.copy')"
              :copied-label="t('common.copied')"
              size="sm"
              variant="soft"
              color="primary"
              class="flex-1 justify-center"
            />
            <UDropdownMenu :items="menu(link)">
              <UButton
                icon="i-lucide-ellipsis"
                size="sm"
                color="neutral"
                variant="ghost"
                :aria-label="t('common.more')"
              />
            </UDropdownMenu>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1 sm:hidden">
          <CopyButton
            v-if="link.shortUrl"
            :text="link.shortUrl"
            :label="t('links.copy')"
            icon-only
            variant="soft"
            color="primary"
          />
          <UDropdownMenu :items="menu(link)">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="t('common.more')"
            />
          </UDropdownMenu>
        </div>
      </div>
    </TransitionGroup>
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
      :busy-label="t('busy.adding')"
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
          >
            <template
              v-if="canPaste && !form.destinationUrl"
              #trailing
            >
              <UButton
                size="xs"
                variant="soft"
                icon="i-lucide-clipboard-paste"
                :label="t('links.pasteButton')"
                @click="pasteIntoForm"
              />
            </template>
          </UInput>
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
                <LinkPriceInput v-model="form.priceIdr" />
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
