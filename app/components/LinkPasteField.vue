<script setup lang="ts">
import type { LinkRow } from '~/pages/app/links/index.vue'

/**
 * "Tempel link produk": paste (or tap Tempel) and the product is created in place. The parent shows the
 * shimmer card between `start` and `done`/`fail`, and polls the autofill with watchFill.
 */
const props = defineProps<{ showInBio?: boolean, compact?: boolean, autofocus?: boolean }>()
const emit = defineEmits<{
  start: [url: string]
  done: [link: LinkRow, customIgnored: boolean]
  fail: []
}>()
const { t } = useI18n()
const toast = useToast()
const entitlements = useEntitlements()
const { create, readClipboard } = useAddProductLink()

const url = ref('')
const busy = ref(false)
const canPaste = ref(false)
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

async function add(raw: string) {
  const valid = asUrl(raw)
  if (!valid) {
    toast.add({ title: t('links.pasteInvalid'), color: 'warning' })
    return
  }
  if (busy.value) return
  busy.value = true
  emit('start', valid)
  try {
    const result = await create(valid, { showInBio: props.showInBio ?? true })
    url.value = ''
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
  void add(text)
}

async function pasteFromClipboard() {
  const text = await readClipboard()
  if (!text || !asUrl(text)) {
    toast.add({ title: t('links.pasteNothing'), color: 'warning' })
    return
  }
  url.value = text.trim()
  await add(text)
}
</script>

<template>
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
</template>
