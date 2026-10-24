<script setup lang="ts">
import QRCode from 'qrcode'

/** Share the Etalase: big QR, copy, native share and a three-step "put it in your Instagram bio" guide. */
const props = defineProps<{ url: string, handle: string, celebrate?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

const qr = ref('')
watch(() => [open.value, props.url] as const, async ([isOpen, url]) => {
  if (!isOpen || !url) return
  qr.value = await QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: 'M' }).catch(() => '')
}, { immediate: true })

const canShare = ref(false)
onMounted(() => {
  canShare.value = typeof navigator.share === 'function'
})
async function share() {
  try {
    await navigator.share({ url: props.url, title: t('bio.title') })
  } catch {
    // dismissed by the user
  }
}
const display = computed(() => props.url.replace(/^https?:\/\//, ''))
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="celebrate ? t('bio.share.liveTitle') : t('bio.share.title')"
    :description="celebrate ? t('bio.share.liveBody') : t('bio.share.body')"
  >
    <template #body>
      <div class="space-y-5">
        <div class="mx-auto w-full max-w-60 rounded-xl border border-default bg-default p-2">
          <img
            v-if="qr"
            :src="qr"
            :alt="t('bio.share.qrAlt', { address: display })"
            class="aspect-square w-full"
          >
          <USkeleton
            v-else
            class="aspect-square w-full"
          />
        </div>
        <p class="truncate text-center text-sm text-primary">
          {{ display }}
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <CopyButton
            :text="url"
            :label="t('bio.copy')"
            color="primary"
            variant="solid"
            block
          />
          <UButton
            v-if="canShare"
            icon="i-lucide-share-2"
            color="neutral"
            variant="outline"
            block
            :label="t('bio.share.send')"
            @click="share"
          />
          <UButton
            icon="i-lucide-qr-code"
            color="neutral"
            variant="outline"
            block
            :label="t('bio.qr')"
            @click="downloadQr(url, `etalase-${handle}`)"
          />
        </div>
        <div>
          <p class="mb-2 text-sm font-medium text-highlighted">
            {{ t('bio.share.guideTitle') }}
          </p>
          <ol class="space-y-2">
            <li
              v-for="n in 3"
              :key="n"
              class="flex items-start gap-3 text-sm text-default"
            >
              <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{{ n }}</span>
              <span class="pt-0.5">{{ t(`bio.share.step${n}`) }}</span>
            </li>
          </ol>
        </div>
      </div>
    </template>
  </ResponsiveSheet>
</template>
