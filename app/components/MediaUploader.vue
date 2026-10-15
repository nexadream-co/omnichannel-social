<script setup lang="ts">
export interface UploadItem {
  key: string
  mediaId: string | null
  previewUrl: string | null
  kind: 'image' | 'video'
  mime: string
  bytes: number
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  progress: number
  error: string | null
  width?: number | null
  height?: number | null
  durationMs?: number | null
}

const items = defineModel<UploadItem[]>({ default: () => [] })
const props = defineProps<{ max?: number }>()
const { t } = useI18n()
const toast = useToast()
const entitlements = useEntitlements()
const input = useTemplateRef<HTMLInputElement>('file')

function patch(key: string, values: Partial<UploadItem>) {
  items.value = items.value.map(item => item.key === key ? { ...item, ...values } : item)
}

/** PUT straight to storage with real progress (XHR: fetch has no upload progress). */
function put(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('content-type', file.type)
    xhr.upload.onprogress = event => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100))
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('network'))
    xhr.send(file)
  })
}

async function waitReady(key: string, mediaId: string) {
  for (let attempt = 0; attempt < 600; attempt++) {
    const media = await apiFetch<{ status: UploadItem['status'], url: string | null, error: string | null, width: number | null, height: number | null, durationMs: number | null, mime: string }>(`/api/app/media/${mediaId}`)
    if (media.status === 'ready' || media.status === 'failed') {
      patch(key, { status: media.status, error: media.error, width: media.width, height: media.height, durationMs: media.durationMs, mime: media.mime, previewUrl: media.url ?? items.value.find(i => i.key === key)?.previewUrl ?? null })
      return
    }
    await new Promise(resolve => setTimeout(resolve, attempt < 10 ? 1000 : 3000))
  }
}

async function upload(file: File) {
  const key = `${Date.now()}-${Math.random()}`
  const kind = file.type.startsWith('video/') ? 'video' : 'image'
  items.value = [...items.value, { key, mediaId: null, previewUrl: kind === 'image' ? URL.createObjectURL(file) : null, kind, mime: file.type, bytes: file.size, status: 'uploading', progress: 0, error: null }]
  try {
    const mime = file.type || (file.name.toLowerCase().endsWith('.heic') ? 'image/heic' : '')
    const { mediaId, uploadUrl } = await apiFetch<{ mediaId: string, uploadUrl: string }>('/api/app/media/presign', { method: 'POST', body: { filename: file.name, mime, bytes: file.size } })
    patch(key, { mediaId })
    await put(uploadUrl, file, progress => patch(key, { progress }))
    patch(key, { status: 'processing' })
    await apiFetch(`/api/app/media/${mediaId}/complete`, { method: 'POST' })
    await waitReady(key, mediaId)
  } catch (caught) {
    if (entitlements.handlePlanError(caught)) {
      items.value = items.value.filter(i => i.key !== key)
      return
    }
    patch(key, { status: 'failed', error: extractErrorMessage(caught, t('authError.generic')) })
  }
}

function onFiles(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  const room = (props.max ?? 10) - items.value.length
  if (files.length > room) toast.add({ title: t('channel.tooManyMedia', { max: props.max ?? 10 }), color: 'warning' })
  files.slice(0, Math.max(0, room)).forEach(upload)
  if (input.value) input.value.value = ''
}

function remove(key: string) {
  items.value = items.value.filter(item => item.key !== key)
}
</script>

<template>
  <div class="space-y-2">
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
      <div
        v-for="item in items"
        :key="item.key"
        class="relative aspect-square rounded-md overflow-hidden bg-elevated border border-default"
      >
        <img
          v-if="item.previewUrl && item.kind === 'image'"
          :src="item.previewUrl"
          alt=""
          class="size-full object-cover"
        >
        <video
          v-else-if="item.previewUrl && item.kind === 'video'"
          :src="item.previewUrl"
          class="size-full object-cover"
          muted
          playsinline
        />
        <div
          v-else
          class="size-full flex items-center justify-center"
        >
          <UIcon
            :name="item.kind === 'video' ? 'i-lucide-video' : 'i-lucide-image'"
            class="size-8 text-muted"
          />
        </div>
        <div
          v-if="item.status === 'uploading' || item.status === 'processing'"
          class="absolute inset-0 bg-default/70 flex flex-col items-center justify-center gap-1 text-xs text-default"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-5 animate-spin"
          />
          <span>{{ item.status === 'uploading' ? t('composer.uploading', { percent: item.progress }) : t('composer.processing') }}</span>
        </div>
        <div
          v-if="item.status === 'failed'"
          class="absolute inset-0 bg-error/85 text-inverted text-xs p-2 flex items-center text-center"
        >
          {{ item.error }}
        </div>
        <UButton
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="solid"
          class="absolute top-1 right-1 rounded-full"
          :aria-label="t('composer.remove')"
          @click="remove(item.key)"
        />
      </div>
      <button
        v-if="items.length < (max ?? 10)"
        type="button"
        class="aspect-square rounded-md border-2 border-dashed border-default text-muted hover:text-default hover:border-accented flex flex-col items-center justify-center gap-1 text-xs"
        @click="input?.click()"
      >
        <UIcon
          name="i-lucide-image-plus"
          class="size-6"
        />
        {{ t('composer.addMedia') }}
      </button>
    </div>
    <input
      ref="file"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,video/mp4,video/quicktime"
      class="hidden"
      @change="onFiles"
    >
  </div>
</template>
