<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { MERCHANT_META, type Merchant } from '#shared/utils/links'
import type { LinkRow } from '~/pages/app/links/index.vue'

/**
 * "Tempel link produk": paste (or tap Tempel) and a preview card shows the product's photo and title, like a
 * chat app does. When the shop hides its photo, the creator can add one from the card. The creator adds the
 * product with Tambah (or Enter); a paste never saves on its own. The parent shows the shimmer card between
 * `start` and `done`/`fail`, and polls the autofill with watchFill.
 */
const props = defineProps<{ showInBio?: boolean, compact?: boolean, autofocus?: boolean }>()
const emit = defineEmits<{
  start: [url: string]
  done: [link: LinkRow, customIgnored: boolean]
  fail: []
}>()
const { t, locale } = useI18n()
const toast = useToast()
const entitlements = useEntitlements()
const { create, readClipboard } = useAddProductLink()
const productPhoto = useProductPhoto()

interface Preview { url: string, host: string, merchant: Merchant, title: string | null, titleGuessed: boolean, imageUrl: string | null, priceIdr: number | null }

const url = ref('')
const busy = ref(false)
const canPaste = ref(false)
const preview = ref<Preview | null>(null)
const previewing = ref(false)
/** A photo the creator added on the card, already uploaded. */
const ownPhoto = ref<string | null>(null)
const uploadingPhoto = ref(false)
onMounted(() => {
  canPaste.value = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'
})

function asUrl(raw: string): string | null {
  const value = raw.trim()
  if (!/^https?:\/\/\S+$/i.test(value)) return null
  try {
    return new URL(value).href
  } catch {
    return null
  }
}

let previewFor = ''
async function loadPreview(raw: string) {
  const valid = asUrl(raw)
  if (!valid || !valid.startsWith('https://')) {
    previewFor = ''
    preview.value = null
    previewing.value = false
    return
  }
  if (valid === previewFor) return
  previewFor = valid
  ownPhoto.value = null
  previewing.value = true
  try {
    const result = await apiFetch<Preview>('/api/app/links/preview', { method: 'POST', body: { url: valid } })
    if (previewFor === valid) preview.value = result
  } catch {
    // No preview is fine: the link can still be added and the autofill tries again.
    if (previewFor === valid) preview.value = null
  } finally {
    if (previewFor === valid) previewing.value = false
  }
}
const loadPreviewSoon = useDebounceFn(loadPreview, 500)
watch(url, value => void loadPreviewSoon(value))

async function pickPhoto(file: File) {
  uploadingPhoto.value = true
  try {
    ownPhoto.value = await productPhoto.upload(file)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    uploadingPhoto.value = false
  }
}

function clear() {
  url.value = ''
  void loadPreview('')
}

async function add(raw: string) {
  const valid = asUrl(raw)
  if (!valid) {
    toast.add({ title: t('links.pasteInvalid'), color: 'warning' })
    return
  }
  if (busy.value || uploadingPhoto.value) return
  busy.value = true
  const found = preview.value?.url === valid ? preview.value : null
  emit('start', valid)
  try {
    const result = await create(valid, {
      showInBio: props.showInBio ?? true,
      // A name guessed from the link is left to the autofill, which keeps the shop's real title if it finds one.
      title: found && !found.titleGuessed ? found.title ?? undefined : undefined,
      priceIdr: found?.priceIdr ?? undefined,
      imageUrl: ownPhoto.value ?? undefined,
      imageSourceUrl: ownPhoto.value ? undefined : found?.imageUrl ?? undefined
    })
    clear()
    emit('done', result.link, result.customIgnored)
  } catch (caught) {
    emit('fail')
    if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    busy.value = false
  }
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!asUrl(text)) return
  event.preventDefault()
  url.value = text.trim()
  void loadPreview(text)
}

async function pasteFromClipboard() {
  const text = await readClipboard()
  if (!text || !asUrl(text)) {
    toast.add({ title: t('links.pasteNothing'), color: 'warning' })
    return
  }
  url.value = text.trim()
  void loadPreview(text)
}
</script>

<template>
  <div class="w-full space-y-2">
    <div
      v-if="previewing || preview"
      class="flex items-center gap-3 rounded-lg bg-elevated/60 p-2"
      aria-live="polite"
    >
      <USkeleton
        v-if="previewing"
        class="size-14 rounded shrink-0"
      />
      <ProductPhotoButton
        v-else
        :src="ownPhoto ?? preview!.imageUrl"
        :title="preview!.title ?? preview!.host"
        :merchant="preview!.merchant"
        :busy="uploadingPhoto"
        :disabled="busy"
        class="size-14"
        @pick="pickPhoto"
      />
      <div
        v-if="previewing"
        class="min-w-0 flex-1 space-y-1.5"
      >
        <USkeleton class="h-3.5 w-4/5" />
        <USkeleton class="h-3 w-1/3" />
      </div>
      <div
        v-else
        class="min-w-0 flex-1"
      >
        <p class="text-sm font-medium text-highlighted line-clamp-2">
          {{ preview!.title || preview!.url }}
        </p>
        <p
          v-if="!ownPhoto && !preview!.imageUrl"
          class="text-xs text-muted"
        >
          {{ t('links.previewNoPhoto') }}
        </p>
        <p class="text-xs text-muted truncate">
          <span
            v-if="preview!.merchant !== 'other'"
            :style="{ color: MERCHANT_META[preview!.merchant].color }"
          >{{ MERCHANT_META[preview!.merchant].label }} · </span>{{ preview!.host }}<span v-if="preview!.priceIdr"> · {{ formatIDR(preview!.priceIdr, locale) }}</span>
        </p>
      </div>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('links.previewClear')"
        :disabled="busy"
        @click="clear"
      />
    </div>
    <form
      class="flex w-full items-center gap-2"
      @submit.prevent="add(url)"
    >
      <UInput
        v-model="url"
        type="url"
        inputmode="url"
        icon="i-lucide-link"
        :placeholder="t('links.pastePlaceholder')"
        :size="compact ? 'md' : 'lg'"
        :autofocus="autofocus"
        :disabled="busy"
        class="min-w-0 flex-1"
        @paste="onPaste"
      />
      <UButton
        v-if="url.trim()"
        type="submit"
        icon="i-lucide-plus"
        :loading="busy"
        :disabled="uploadingPhoto"
        :label="t('links.addShort')"
        :size="compact ? 'md' : 'lg'"
      />
      <UButton
        v-else-if="canPaste"
        icon="i-lucide-clipboard-paste"
        variant="soft"
        :label="t('links.pasteButton')"
        :loading="busy"
        :size="compact ? 'md' : 'lg'"
        @click="pasteFromClipboard"
      />
    </form>
  </div>
</template>
