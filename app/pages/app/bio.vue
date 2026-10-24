<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'
import { haptic } from '~/utils/haptics'
import { AVATAR_MAX_BYTES, AVATAR_MAX_PX } from '#shared/utils/uploads'
import { BIO_SOCIALS, BIO_THEMES, normalizeHandle, type BioSocial, type BioThemeKey } from '#shared/utils/bio'
import type { Merchant } from '#shared/utils/links'
import type { LinkRow } from './links/index.vue'
import type { BioItemPatch } from '~/components/BioItemSheet.vue'

interface BioItem { id: string, linkId: string | null, categoryId: string | null, pinned: boolean, visible: boolean, position: number, title: string | null, imageUrl: string | null, priceIdr: number | null, merchant: Merchant | null, badge: string | null }
interface BioPage {
  id: string
  handle: string
  title: string | null
  bio: string | null
  avatarUrl: string | null
  published: boolean
  theme: BioThemeKey
  socials: Partial<Record<BioSocial, string>>
  indexable: boolean
  url: string
  categories: { id: string, name: string }[]
  items: BioItem[]
}

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const toast = useToast()
const config = useRuntimeConfig()
const entitlements = useEntitlements()
const undo = useUndoToast()
const { spark, confetti } = useCelebrate()
const milestones = useMilestones()
const reducedMotion = usePreferredReducedMotion()
useHead({ title: () => t('bio.title') })

const page = ref<BioPage | null>(null)
const loading = ref(true)
onMounted(async () => {
  try {
    page.value = (await apiFetch<{ page: BioPage | null }>('/api/app/bio')).page
    if (page.value) resetForm(page.value)
  } finally {
    loading.value = false
  }
})

function fail(caught: unknown) {
  if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
}

/** Every mutation returns the full editor view, so the page simply swaps it in. Throws on failure. */
async function request(url: string, options: Parameters<typeof apiFetch>[1]) {
  const result = await apiFetch<{ page: BioPage | null }>(url, options)
  if (result.page) page.value = result.page
}

/** Same, but failures become a toast (or the upgrade dialog) and the result is a boolean. */
async function mutate(url: string, options: Parameters<typeof apiFetch>[1]) {
  try {
    await request(url, options)
    return true
  } catch (caught) {
    fail(caught)
    return false
  }
}

// ---- Create (onboarding step 2) ----
// Mirrors bioUrl() on the server: /@name on the short domain, /bio/name when it shares the app host (dev).
const address = computed(() => {
  const short = new URL(config.public.shortUrl)
  const prefix = short.host === new URL(config.public.siteUrl).host ? '/bio/' : '/@'
  return `${short.host}${prefix}${normalizeHandle(create.handle) || 'nama'}`
})
const create = reactive({ handle: '', title: '' })
const handleState = ref<{ available: boolean, reason: string } | null>(null)
let checkTimer: ReturnType<typeof setTimeout> | undefined
watch(() => create.handle, (value) => {
  handleState.value = null
  clearTimeout(checkTimer)
  if (normalizeHandle(value).length < 3) return
  checkTimer = setTimeout(async () => {
    handleState.value = await apiFetch<{ available: boolean, reason: string }>('/api/app/bio/handle-check', { query: { handle: value } }).catch(() => null)
  }, 350)
})
const creating = ref(false)
async function createPage() {
  creating.value = true
  if (await mutate('/api/app/bio', { method: 'POST', body: { handle: create.handle, title: create.title || create.handle } }) && page.value) resetForm(page.value)
  creating.value = false
}

// ---- Profile form ----
const form = reactive({ title: '', bio: '', handle: '', theme: 'rose' as BioThemeKey, indexable: true, socials: {} as Partial<Record<BioSocial, string>> })
function resetForm(value: BioPage) {
  Object.assign(form, { title: value.title ?? '', bio: value.bio ?? '', handle: value.handle, theme: value.theme, indexable: value.indexable, socials: { ...value.socials } })
}
const dirty = computed(() => Boolean(page.value) && (form.title !== (page.value!.title ?? '') || form.bio !== (page.value!.bio ?? '') || form.handle !== page.value!.handle
  || form.theme !== page.value!.theme || form.indexable !== page.value!.indexable || BIO_SOCIALS.some(key => (form.socials[key] ?? '') !== (page.value!.socials[key] ?? ''))))
useUnsavedChanges(dirty)
const saving = ref(false)
const profilePop = useCheckPop()
async function saveProfile() {
  saving.value = true
  const socials = Object.fromEntries(BIO_SOCIALS.map(key => [key, (form.socials[key] ?? '').trim()]))
  if (await mutate('/api/app/bio', { method: 'PATCH', body: { title: form.title, bio: form.bio || null, handle: form.handle, theme: form.theme, indexable: form.indexable, socials } })) {
    resetForm(page.value!)
    profilePop.trigger()
  }
  saving.value = false
}

function pickTheme(key: BioThemeKey, event: MouseEvent) {
  if (form.theme === key) return
  form.theme = key
  spark(event.currentTarget as HTMLElement)
}

const uploading = ref(false)
async function uploadAvatarFile(file: File) {
  uploading.value = true
  try {
    const blob = await resizeImage(file, AVATAR_MAX_PX, AVATAR_MAX_BYTES)
    const body = new FormData()
    body.append('file', blob, 'avatar.jpg')
    const { url } = await apiFetch<{ url: string }>('/api/app/uploads?kind=avatar', { method: 'POST', body })
    await mutate('/api/app/bio', { method: 'PATCH', body: { avatarUrl: url } })
  } catch (caught) {
    fail(caught)
  } finally {
    uploading.value = false
  }
}
function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void uploadAvatarFile(file)
}
const avatarCard = ref<HTMLElement | null>(null)
const { isOver: avatarOver } = useFileDrop(avatarCard, { accept: ['image/'], multiple: false, onFiles: ([file]) => file && uploadAvatarFile(file) })

// ---- Publish, share ----
const publishing = ref(false)
const shareOpen = ref(false)
const firstPublish = ref(false)
async function togglePublish(event?: MouseEvent) {
  const button = (event?.currentTarget ?? null) as HTMLElement | null
  publishing.value = true
  const next = !page.value!.published
  const ok = await mutate('/api/app/bio/publish', { method: 'POST', body: { published: next } })
  publishing.value = false
  if (!ok) return
  if (!next) {
    toast.add({ title: t('bio.unpublished'), color: 'success' })
    return
  }
  if (milestones.reach('etalasePublished')) {
    firstPublish.value = true
    shareOpen.value = true
    void confetti({ big: true })
    return
  }
  toast.add({ title: t('bio.published'), color: 'success' })
  if (button) spark(button)
  haptic('success')
}
function openShare() {
  firstPublish.value = false
  shareOpen.value = true
}

// ---- Products: a local copy that Sortable can move, synced from the server view while not dragging ----
const localItems = ref<BioItem[]>([])
const dragging = ref(false)
const pendingRemoved = ref(new Set<string>())
watch(() => page.value?.items, (value) => {
  if (!dragging.value) localItems.value = (value ?? []).filter(item => !pendingRemoved.value.has(item.id))
}, { immediate: true })
const items = computed(() => localItems.value)

const listEl = ref<HTMLElement | null>(null)
const orderPop = useCheckPop(2000)
async function saveOrder() {
  await nextTick()
  const ok = await mutate('/api/app/bio/items/reorder', { method: 'POST', body: { itemIds: localItems.value.map(item => item.id) } })
  if (ok) orderPop.trigger()
  else if (page.value) localItems.value = [...page.value.items]
}
useSortable(listEl, localItems, {
  watchElement: true,
  handle: '.drag-handle',
  delay: 300,
  delayOnTouchOnly: true,
  animation: reducedMotion.value === 'reduce' ? 0 : 200,
  ghostClass: 'opacity-40',
  chosenClass: 'scale-[1.03]',
  onStart: () => {
    dragging.value = true
    haptic('tick')
  },
  onEnd: () => {
    dragging.value = false
  },
  onUpdate: (event) => {
    moveArrayElement(localItems, event.oldIndex!, event.newIndex!, event)
    void saveOrder()
  }
})
function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= localItems.value.length) return
  moveArrayElement(localItems, index, target)
  void saveOrder()
}

const patchItem = (item: BioItem, body: Record<string, unknown>) => mutate(`/api/app/bio/items/${item.id}`, { method: 'PATCH', body })

async function hideItem(item: BioItem) {
  const snapshot = localItems.value
  await undo.run({
    title: t('bio.hiddenToast'),
    apply: () => {
      localItems.value = snapshot.map(row => row.id === item.id ? { ...row, visible: false } : row)
    },
    rollback: () => {
      localItems.value = snapshot
    },
    commit: () => request(`/api/app/bio/items/${item.id}`, { method: 'PATCH', body: { visible: false } }),
    undo: () => request(`/api/app/bio/items/${item.id}`, { method: 'PATCH', body: { visible: true } })
  })
}
const showItem = (item: BioItem) => patchItem(item, { visible: true })

async function removeItem(item: BioItem) {
  if (!item.linkId) return
  const snapshot = localItems.value
  await undo.run({
    title: t('bio.removedToast'),
    apply: () => {
      pendingRemoved.value.add(item.id)
      localItems.value = snapshot.filter(row => row.id !== item.id)
    },
    rollback: () => {
      pendingRemoved.value.delete(item.id)
      localItems.value = snapshot
    },
    commit: async () => {
      try {
        await request(`/api/app/bio/products/${item.linkId}`, { method: 'DELETE' })
      } finally {
        pendingRemoved.value.delete(item.id)
      }
    }
  })
}

// Tap a row to edit label, category, pin and hide.
const sheetOpen = ref(false)
const sheetItemId = ref<string | null>(null)
const sheetItem = computed(() => localItems.value.find(item => item.id === sheetItemId.value) ?? null)
const sheetSaving = ref(false)
function editItem(item: BioItem) {
  sheetItemId.value = item.id
  sheetOpen.value = true
}
async function saveSheet(patch: BioItemPatch) {
  if (!sheetItem.value) return
  sheetSaving.value = true
  const ok = await patchItem(sheetItem.value, { ...patch })
  sheetSaving.value = false
  if (ok) sheetOpen.value = false
}
function removeFromSheet() {
  const item = sheetItem.value
  sheetOpen.value = false
  if (item) void removeItem(item)
}
const categoryName = (id: string | null) => page.value?.categories.find(category => category.id === id)?.name ?? null

const pickerOpen = ref(false)
const available = ref<LinkRow[]>([])
const pickerLoading = ref(false)
async function openPicker() {
  pickerOpen.value = true
  pickerLoading.value = true
  try {
    const result = await apiFetch<{ items: LinkRow[] }>('/api/app/links', { query: { archived: 'false', limit: 100 } })
    const present = new Set(items.value.map(item => item.linkId))
    available.value = result.items.filter(link => !present.has(link.id))
  } finally {
    pickerLoading.value = false
  }
}
async function addProduct(link: LinkRow) {
  if (await mutate('/api/app/bio/products', { method: 'POST', body: { linkId: link.id } })) available.value = available.value.filter(row => row.id !== link.id)
}
// A link pasted in the picker is created with "Tampil di Etalase" on, so it only needs the editor view again.
const pasting = ref(false)
async function onPasted(link: LinkRow) {
  pasting.value = false
  try {
    page.value = (await apiFetch<{ page: BioPage | null }>('/api/app/bio')).page
  } catch (caught) {
    fail(caught)
  }
  if (!page.value?.items.some(item => item.linkId === link.id)) await addProduct(link)
  pickerOpen.value = false
}

// ---- Categories ----
const newCategory = ref('')
async function addCategory() {
  if (!newCategory.value.trim()) return
  if (await mutate('/api/app/bio/categories', { method: 'POST', body: { name: newCategory.value } })) newCategory.value = ''
}

// ---- Preview (same look as the public page, from unsaved form values) ----
const theme = computed(() => BIO_THEMES[form.theme])
const previewItems = computed(() => [...items.value].filter(item => item.visible).sort((a, b) => Number(b.pinned) - Number(a.pinned)))
const SOCIAL_ICON: Record<BioSocial, string> = { instagram: 'i-simple-icons-instagram', threads: 'i-simple-icons-threads', tiktok: 'i-simple-icons-tiktok', facebook: 'i-simple-icons-facebook', youtube: 'i-simple-icons-youtube', whatsapp: 'i-simple-icons-whatsapp' }
const SOCIAL_PLACEHOLDER: Record<BioSocial, string> = { instagram: '@namakamu', threads: '@namakamu', tiktok: '@namakamu', facebook: 'facebook.com/halamanmu', youtube: '@kanalmu', whatsapp: '0812xxxxxxx' }
const previewOpen = ref(false)
</script>

<template>
  <div class="w-full max-w-6xl mx-auto">
    <div
      v-if="loading"
      class="space-y-4"
    >
      <USkeleton class="h-10 w-48" />
      <USkeleton class="h-64 w-full" />
    </div>

    <!-- First visit: pick a handle -->
    <div
      v-else-if="!page"
      class="w-full max-w-md mx-auto"
    >
      <CommandBar
        :title="t('bio.createTitle')"
        :description="t('bio.createBody', { address })"
      />
      <UCard>
        <form
          class="space-y-4"
          @submit.prevent="createPage"
        >
          <UFormField
            :label="t('bio.handle')"
            :error="handleState && !handleState.available ? handleState.reason : undefined"
            :hint="handleState?.available ? t('bio.available') : undefined"
            required
          >
            <UInput
              v-model="create.handle"
              class="w-full"
              size="lg"
              autocapitalize="none"
              autocomplete="off"
              :placeholder="'namakamu'"
            >
              <template #leading>
                <span class="text-muted text-sm">@</span>
              </template>
            </UInput>
          </UFormField>
          <UFormField :label="t('bio.displayName')">
            <UInput
              v-model="create.title"
              class="w-full"
              :placeholder="create.handle || 'Rina Rekomendasi'"
            />
          </UFormField>
          <UButton
            type="submit"
            block
            size="lg"
            :loading="creating"
            :disabled="!handleState?.available"
            :label="t('bio.create')"
          />
        </form>
      </UCard>
    </div>

    <template v-else>
      <CommandBar
        :title="t('bio.title')"
        :description="t('bio.subtitle')"
      >
        <UButton
          v-if="page.published"
          icon="i-lucide-share-2"
          :label="t('bio.share.button')"
          @click="openShare"
        />
        <UButton
          v-else
          icon="i-lucide-send"
          :label="t('bio.publish')"
          :loading="publishing"
          @click="togglePublish"
        />
        <UDropdownMenu
          :items="[[
            { label: t('bio.qr'), icon: 'i-lucide-qr-code', onSelect: () => downloadQr(page!.url, `etalase-${page!.handle}`) },
            ...(page.published ? [{ label: t('bio.unpublish'), icon: 'i-lucide-eye-off', onSelect: () => togglePublish() }] : [])
          ]]"
        >
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="outline"
            :aria-label="t('common.more')"
          />
        </UDropdownMenu>
      </CommandBar>

      <UAlert
        v-if="!page.published"
        icon="i-lucide-info"
        color="warning"
        variant="subtle"
        :title="t('bio.draftNotice')"
        class="mb-4"
      />
      <div
        v-else
        class="mb-4 flex items-center gap-2 text-sm min-w-0"
      >
        <UBadge
          color="success"
          variant="subtle"
          :label="t('bio.live')"
        />
        <a
          :href="page.url"
          target="_blank"
          rel="noopener"
          class="text-primary truncate"
        >{{ page.url.replace(/^https?:\/\//, '') }}</a>
        <CopyButton
          :text="page.url"
          :label="t('bio.copy')"
          size="xs"
          variant="ghost"
          icon-only
        />
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="space-y-6 min-w-0">
          <!-- Profile -->
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                {{ t('bio.profile') }}
              </h2>
            </template>
            <div class="space-y-4">
              <div
                ref="avatarCard"
                class="flex items-center gap-4 rounded-lg p-2 -m-2 transition-colors"
                :class="avatarOver ? 'bg-primary/10 ring-2 ring-primary/40' : ''"
              >
                <SmartImage
                  :src="page.avatarUrl"
                  :title="form.title || page.handle"
                  :alt="form.title || page.handle"
                  kind="avatar"
                  class="size-20 shrink-0 rounded-full"
                />
                <div class="min-w-0 space-y-1">
                  <label class="inline-block cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      class="sr-only"
                      @change="uploadAvatar"
                    >
                    <span class="inline-flex items-center gap-1.5 rounded-md border border-default px-3 py-1.5 text-sm hover:bg-elevated">
                      <UIcon
                        :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
                        :class="uploading && 'motion-safe:animate-spin'"
                        class="size-4"
                      />
                      {{ uploading ? t('busy.uploadingPlain') : t('bio.avatar') }}
                    </span>
                  </label>
                  <p class="hidden text-xs text-muted sm:block">
                    {{ avatarOver ? t('drop.here') : t('bio.avatarDrop') }}
                  </p>
                </div>
              </div>
              <UFormField
                :label="t('bio.displayName')"
                required
              >
                <UInput
                  v-model="form.title"
                  class="w-full"
                  :maxlength="80"
                />
              </UFormField>
              <UFormField :label="t('bio.bioText')">
                <UTextarea
                  v-model="form.bio"
                  class="w-full"
                  :rows="3"
                  :maxlength="300"
                  :placeholder="t('bio.bioPlaceholder')"
                  autoresize
                />
              </UFormField>
              <UFormField :label="t('bio.theme.title')">
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="(preset, key) in BIO_THEMES"
                    :key="key"
                    type="button"
                    class="rounded-lg border-2 p-2 text-left transition-colors"
                    :class="form.theme === key ? 'border-primary' : 'border-default'"
                    :aria-pressed="form.theme === key"
                    @click="pickTheme(key, $event)"
                  >
                    <span
                      class="block h-10 rounded-md flex items-end p-1.5 gap-1"
                      :style="{ background: preset.background }"
                    >
                      <span
                        class="h-4 flex-1 rounded-sm"
                        :style="{ background: preset.card }"
                      />
                      <span
                        class="h-4 w-4 rounded-sm"
                        :style="{ background: preset.accent }"
                      />
                    </span>
                    <span class="block mt-1.5 text-sm text-default">{{ t(preset.labelKey) }}</span>
                  </button>
                </div>
              </UFormField>
              <UCollapsible>
                <UButton
                  color="neutral"
                  variant="ghost"
                  block
                  class="justify-between px-0"
                  :label="t('bio.socials')"
                  trailing-icon="i-lucide-chevron-down"
                />
                <template #content>
                  <div class="grid gap-3 sm:grid-cols-2 pt-3">
                    <UInput
                      v-for="key in BIO_SOCIALS"
                      :key="key"
                      v-model="form.socials[key]"
                      :icon="SOCIAL_ICON[key]"
                      :placeholder="SOCIAL_PLACEHOLDER[key]"
                      :aria-label="key"
                      class="w-full"
                    />
                  </div>
                </template>
              </UCollapsible>
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
                    <UFormField :label="t('bio.handle')">
                      <UInput
                        v-model="form.handle"
                        class="w-full"
                        autocapitalize="none"
                      >
                        <template #leading>
                          <span class="text-muted text-sm">@</span>
                        </template>
                      </UInput>
                    </UFormField>
                    <USwitch
                      v-model="form.indexable"
                      :label="t('bio.indexable')"
                    />
                  </div>
                </template>
              </UCollapsible>
            </div>
          </UCard>

          <!-- Products -->
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-semibold text-highlighted">
                  {{ t('bio.products') }} <span class="text-muted font-normal">({{ items.length }})</span>
                </h2>
                <span
                  v-if="orderPop.done.value"
                  class="flex items-center gap-1 text-xs text-success"
                  role="status"
                >
                  <UIcon
                    name="i-lucide-check"
                    class="size-4"
                  />
                  {{ t('bio.orderSaved') }}
                </span>
                <UButton
                  size="sm"
                  icon="i-lucide-plus"
                  variant="soft"
                  :label="t('bio.addProducts')"
                  @click="openPicker"
                />
              </div>
            </template>
            <EmptyState
              v-if="!items.length"
              icon="i-lucide-store"
              :title="t('bio.emptyTitle')"
              :description="t('bio.emptyBody')"
              :action="{ label: t('bio.addProducts'), icon: 'i-lucide-plus', onClick: openPicker }"
            />
            <ul
              v-else
              ref="listEl"
              class="divide-y divide-default"
            >
              <li
                v-for="(item, index) in items"
                :key="item.id"
                class="flex items-center gap-2 bg-default p-2.5 sm:p-3"
              >
                <span
                  class="drag-handle grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:bg-elevated active:cursor-grabbing"
                  aria-hidden="true"
                >
                  <UIcon
                    name="i-lucide-grip-vertical"
                    class="size-5"
                  />
                </span>
                <div class="sr-only focus-within:not-sr-only focus-within:flex focus-within:flex-col">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-chevron-up"
                    :aria-label="t('bio.up')"
                    :disabled="index === 0"
                    @click="move(index, -1)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-chevron-down"
                    :aria-label="t('bio.down')"
                    :disabled="index === items.length - 1"
                    @click="move(index, 1)"
                  />
                </div>
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left"
                  :class="!item.visible && 'opacity-60'"
                  :aria-label="t('bio.editItem', { title: item.title ?? '' })"
                  @click="editItem(item)"
                >
                  <SmartImage
                    :src="item.imageUrl"
                    :title="item.title"
                    :alt="item.title ?? ''"
                    :merchant="item.merchant"
                    kind="product"
                    class="size-14 shrink-0 rounded-md"
                  />
                  <span class="min-w-0 flex-1 space-y-1">
                    <span class="block text-sm font-medium text-highlighted line-clamp-2">{{ item.title }}</span>
                    <span class="flex flex-wrap items-center gap-1 text-xs text-muted">
                      <span v-if="item.priceIdr">{{ formatIDR(item.priceIdr, locale) }}</span>
                      <UIcon
                        v-if="item.pinned"
                        name="i-lucide-pin"
                        class="size-3.5 text-primary"
                      />
                      <UBadge
                        v-if="item.badge"
                        color="primary"
                        variant="subtle"
                        size="sm"
                        :label="item.badge"
                      />
                      <UBadge
                        v-if="categoryName(item.categoryId)"
                        color="neutral"
                        variant="subtle"
                        size="sm"
                        :label="categoryName(item.categoryId)!"
                      />
                      <UBadge
                        v-if="!item.visible"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :label="t('bio.hidden')"
                      />
                    </span>
                  </span>
                </button>
                <UDropdownMenu
                  :items="[[
                    { label: t('bio.editItemShort'), icon: 'i-lucide-pencil', onSelect: () => editItem(item) },
                    item.visible
                      ? { label: t('bio.hide'), icon: 'i-lucide-eye-off', onSelect: () => hideItem(item) }
                      : { label: t('bio.show'), icon: 'i-lucide-eye', onSelect: () => showItem(item) },
                    { label: t('common.remove'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeItem(item) }
                  ]]"
                >
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-ellipsis-vertical"
                    :aria-label="t('common.more')"
                  />
                </UDropdownMenu>
              </li>
            </ul>
          </UCard>

          <!-- Categories -->
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                {{ t('bio.categories') }}
              </h2>
            </template>
            <div class="space-y-3">
              <div
                v-if="page.categories.length"
                class="flex flex-wrap gap-2"
              >
                <UBadge
                  v-for="category in page.categories"
                  :key="category.id"
                  color="neutral"
                  variant="subtle"
                  size="lg"
                  class="gap-1"
                >
                  {{ category.name }}
                  <button
                    type="button"
                    class="text-muted hover:text-error"
                    :aria-label="t('common.remove')"
                    @click="mutate(`/api/app/bio/categories/${category.id}`, { method: 'DELETE' })"
                  >
                    <UIcon
                      name="i-lucide-x"
                      class="size-3.5"
                    />
                  </button>
                </UBadge>
              </div>
              <form
                class="flex gap-2"
                @submit.prevent="addCategory"
              >
                <UInput
                  v-model="newCategory"
                  :placeholder="t('bio.categoryName')"
                  :maxlength="40"
                  class="flex-1"
                />
                <UButton
                  type="submit"
                  color="neutral"
                  variant="outline"
                  :label="t('bio.addCategory')"
                  :disabled="!newCategory.trim()"
                />
              </form>
            </div>
          </UCard>
        </div>

        <!-- Live phone preview: sticky on desktop, a floating pill on phone -->
        <div class="hidden lg:block">
          <div class="sticky top-4">
            <p class="text-sm font-medium text-muted mb-2">
              {{ t('bio.preview') }}
            </p>
            <BioPreview
              :theme="theme"
              :title="form.title || page.handle"
              :bio="form.bio"
              :avatar-url="page.avatarUrl"
              :socials="form.socials"
              :icons="SOCIAL_ICON"
              :categories="page.categories"
              :items="previewItems"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-inverted px-4 py-2 text-sm font-medium text-inverted shadow-lg lg:hidden"
        @click="previewOpen = true"
      >
        <UIcon
          name="i-lucide-smartphone"
          class="size-4"
        />
        {{ t('bio.preview') }}
      </button>

      <ResponsiveSheet
        v-model:open="previewOpen"
        :title="t('bio.preview')"
      >
        <template #body>
          <BioPreview
            :theme="theme"
            :title="form.title || page.handle"
            :bio="form.bio"
            :avatar-url="page.avatarUrl"
            :socials="form.socials"
            :icons="SOCIAL_ICON"
            :categories="page.categories"
            :items="previewItems"
          />
        </template>
      </ResponsiveSheet>

      <BioItemSheet
        v-model:open="sheetOpen"
        :item="sheetItem"
        :categories="page.categories"
        :saving="sheetSaving"
        @save="saveSheet"
        @remove="removeFromSheet"
      />

      <BioShareSheet
        v-model:open="shareOpen"
        :url="page.url"
        :handle="page.handle"
        :celebrate="firstPublish"
      />

      <StickyActionBar v-if="dirty || profilePop.done.value">
        <template #leading>
          {{ dirty ? t('bio.unsavedHint') : '' }}
        </template>
        <UButton
          v-if="dirty"
          color="neutral"
          variant="ghost"
          :label="t('common.cancel')"
          @click="resetForm(page)"
        />
        <SaveButton
          :loading="saving"
          :done="profilePop.done.value"
          :disabled="!form.title.trim()"
          :busy-label="t('busy.saving')"
          @click="saveProfile"
        />
      </StickyActionBar>

      <ResponsiveSheet
        v-model:open="pickerOpen"
        :title="t('bio.addProducts')"
      >
        <template #body>
          <LinkPasteField
            compact
            class="mb-3"
            @start="pasting = true"
            @done="onPasted"
            @fail="pasting = false"
          />
          <div
            v-if="pickerLoading || pasting"
            class="space-y-2"
          >
            <USkeleton
              v-for="n in 3"
              :key="n"
              class="h-14 w-full"
            />
          </div>
          <EmptyState
            v-else-if="!available.length"
            compact
            icon="i-lucide-link"
            :title="t('bio.pickerEmptyTitle')"
            :description="t('bio.pickerEmpty')"
          />
          <ul
            v-else
            class="divide-y divide-default -my-2"
          >
            <li
              v-for="link in available"
              :key="link.id"
              class="py-2 flex items-center gap-3"
            >
              <SmartImage
                :src="link.imageUrl"
                :title="link.title"
                :merchant="link.merchant"
                kind="product"
                class="size-12 rounded shrink-0"
              />
              <p class="text-sm text-default line-clamp-2 flex-1 min-w-0">
                {{ link.title || link.destinationUrl }}
              </p>
              <UButton
                size="sm"
                icon="i-lucide-plus"
                variant="soft"
                :aria-label="t('bio.addProducts')"
                @click="addProduct(link)"
              />
            </li>
          </ul>
        </template>
      </ResponsiveSheet>
    </template>
  </div>
</template>
