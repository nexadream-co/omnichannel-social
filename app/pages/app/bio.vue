<script setup lang="ts">
import { AVATAR_MAX_BYTES, AVATAR_MAX_PX } from '#shared/utils/uploads'
import { BIO_SOCIALS, BIO_THEMES, normalizeHandle, type BioSocial, type BioThemeKey } from '#shared/utils/bio'
import { MERCHANT_META, type Merchant } from '#shared/utils/links'
import type { LinkRow } from './links/index.vue'

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

/** Every mutation returns the full editor view, so the page simply swaps it in. */
async function mutate(request: string, options: Parameters<typeof apiFetch>[1]) {
  try {
    const result = await apiFetch<{ page: BioPage | null }>(request, options)
    if (result.page) page.value = result.page
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
const saving = ref(false)
async function saveProfile() {
  saving.value = true
  const socials = Object.fromEntries(BIO_SOCIALS.map(key => [key, (form.socials[key] ?? '').trim()]))
  if (await mutate('/api/app/bio', { method: 'PATCH', body: { title: form.title, bio: form.bio || null, handle: form.handle, theme: form.theme, indexable: form.indexable, socials } })) {
    resetForm(page.value!)
    toast.add({ title: t('bio.saved'), color: 'success' })
  }
  saving.value = false
}

const uploading = ref(false)
async function uploadAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
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

// ---- Publish, share ----
const publishing = ref(false)
async function togglePublish() {
  publishing.value = true
  const next = !page.value!.published
  if (await mutate('/api/app/bio/publish', { method: 'POST', body: { published: next } })) toast.add({ title: next ? t('bio.published') : t('bio.unpublished'), color: 'success' })
  publishing.value = false
}
async function copyLink() {
  if (await copyText(page.value!.url)) toast.add({ title: t('links.copied'), color: 'success' })
}

// ---- Products ----
const items = computed(() => page.value?.items ?? [])
async function move(index: number, delta: number) {
  const ids = items.value.map(item => item.id)
  const target = index + delta
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  await mutate('/api/app/bio/items/reorder', { method: 'POST', body: { itemIds: ids } })
}
const patchItem = (item: BioItem, body: Record<string, unknown>) => mutate(`/api/app/bio/items/${item.id}`, { method: 'PATCH', body })
const removeItem = (item: BioItem) => item.linkId && mutate(`/api/app/bio/products/${item.linkId}`, { method: 'DELETE' })

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

// ---- Categories ----
const newCategory = ref('')
async function addCategory() {
  if (!newCategory.value.trim()) return
  if (await mutate('/api/app/bio/categories', { method: 'POST', body: { name: newCategory.value } })) newCategory.value = ''
}
const categoryOptions = computed(() => [{ label: t('bio.noCategory'), value: 'none' }, ...(page.value?.categories ?? []).map(c => ({ label: c.name, value: c.id }))])

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
          icon="i-lucide-copy"
          color="neutral"
          variant="outline"
          :label="t('bio.copy')"
          @click="copyLink"
        />
        <UButton
          icon="i-lucide-qr-code"
          color="neutral"
          variant="outline"
          :label="t('bio.qr')"
          @click="downloadQr(page.url, `etalase-${page.handle}`)"
        />
        <UButton
          :icon="page.published ? 'i-lucide-eye-off' : 'i-lucide-send'"
          :color="page.published ? 'neutral' : 'primary'"
          :variant="page.published ? 'ghost' : 'solid'"
          :label="page.published ? t('bio.unpublish') : t('bio.publish')"
          :loading="publishing"
          @click="togglePublish"
        />
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
              <div class="flex items-center gap-4">
                <UAvatar
                  :src="page.avatarUrl ?? undefined"
                  :alt="form.title || page.handle"
                  size="3xl"
                />
                <label class="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    class="sr-only"
                    @change="uploadAvatar"
                  >
                  <span class="inline-flex items-center gap-1.5 rounded-md border border-default px-3 py-1.5 text-sm hover:bg-elevated">
                    <UIcon
                      :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
                      :class="uploading && 'animate-spin'"
                      class="size-4"
                    />
                    {{ t('bio.avatar') }}
                  </span>
                </label>
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
                    @click="form.theme = key"
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
              <div class="flex justify-end gap-2">
                <UButton
                  v-if="dirty"
                  color="neutral"
                  variant="ghost"
                  :label="t('common.cancel')"
                  @click="resetForm(page)"
                />
                <UButton
                  :label="t('bio.save')"
                  :loading="saving"
                  :disabled="!dirty || !form.title.trim()"
                  @click="saveProfile"
                />
              </div>
            </div>
          </UCard>

          <!-- Products -->
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-semibold text-highlighted">
                  {{ t('bio.products') }} <span class="text-muted font-normal">({{ items.length }})</span>
                </h2>
                <UButton
                  size="sm"
                  icon="i-lucide-plus"
                  variant="soft"
                  :label="t('bio.addProducts')"
                  @click="openPicker"
                />
              </div>
            </template>
            <p
              v-if="!items.length"
              class="p-6 text-center text-sm text-muted"
            >
              {{ t('bio.noProducts') }}
            </p>
            <ul
              v-else
              class="divide-y divide-default"
            >
              <li
                v-for="(item, index) in items"
                :key="item.id"
                class="p-3 sm:p-4 flex gap-3"
                :class="!item.visible && 'opacity-60'"
              >
                <div class="flex flex-col justify-center gap-0.5 shrink-0">
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
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.title ?? ''"
                  class="size-16 rounded-md object-cover shrink-0 bg-elevated"
                >
                <div
                  v-else
                  class="size-16 rounded-md bg-elevated shrink-0"
                />
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium text-highlighted line-clamp-2">
                        <UIcon
                          v-if="item.pinned"
                          name="i-lucide-pin"
                          class="size-3.5 text-primary align-[-2px]"
                        />
                        {{ item.title }}
                      </p>
                      <p class="text-xs text-muted">
                        <span
                          v-if="item.merchant"
                          :style="{ color: MERCHANT_META[item.merchant].color }"
                        >{{ MERCHANT_META[item.merchant].label }}</span>
                        <span v-if="item.priceIdr"> · {{ formatIDR(item.priceIdr, locale) }}</span>
                      </p>
                    </div>
                    <UDropdownMenu
                      :items="[
                        { label: item.pinned ? t('bio.unpin') : t('bio.pin'), icon: 'i-lucide-pin', onSelect: () => patchItem(item, { pinned: !item.pinned }) },
                        { label: item.visible ? t('bio.hide') : t('bio.show'), icon: item.visible ? 'i-lucide-eye-off' : 'i-lucide-eye', onSelect: () => patchItem(item, { visible: !item.visible }) },
                        { label: t('common.remove'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeItem(item) }
                      ]"
                    >
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-ellipsis-vertical"
                        :aria-label="t('common.more')"
                      />
                    </UDropdownMenu>
                  </div>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <UInput
                      :model-value="item.badge ?? ''"
                      size="sm"
                      :placeholder="t('bio.badge')"
                      :maxlength="24"
                      class="w-full"
                      @change="(e: Event) => patchItem(item, { badge: (e.target as HTMLInputElement).value || null })"
                    />
                    <USelect
                      v-if="page.categories.length"
                      :model-value="item.categoryId ?? 'none'"
                      :items="categoryOptions"
                      size="sm"
                      class="w-full"
                      @update:model-value="(v: string) => patchItem(item, { categoryId: v === 'none' ? null : v })"
                    />
                  </div>
                </div>
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

        <!-- Live phone preview: sticky on desktop, a button on phone -->
        <div class="lg:hidden">
          <UButton
            block
            color="neutral"
            variant="outline"
            icon="i-lucide-smartphone"
            :label="t('bio.preview')"
            @click="previewOpen = true"
          />
        </div>
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

      <UModal
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
      </UModal>

      <UModal
        v-model:open="pickerOpen"
        :title="t('bio.addProducts')"
      >
        <template #body>
          <div
            v-if="pickerLoading"
            class="space-y-2"
          >
            <USkeleton
              v-for="n in 3"
              :key="n"
              class="h-14 w-full"
            />
          </div>
          <p
            v-else-if="!available.length"
            class="text-sm text-muted text-center py-4"
          >
            {{ t('links.insertEmpty') }}
          </p>
          <ul
            v-else
            class="divide-y divide-default -my-2"
          >
            <li
              v-for="link in available"
              :key="link.id"
              class="py-2 flex items-center gap-3"
            >
              <img
                v-if="link.imageUrl"
                :src="link.imageUrl"
                alt=""
                class="size-12 rounded object-cover shrink-0"
              >
              <div
                v-else
                class="size-12 rounded bg-elevated shrink-0"
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
      </UModal>
    </template>
  </div>
</template>
