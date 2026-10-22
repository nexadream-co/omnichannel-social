<script setup lang="ts">
import type { Aspect } from '#shared/media/edit-spec'
import type { MediaView } from '#shared/media/types'

export interface UploadItem {
  key: string
  mediaId: string | null
  previewUrl: string | null
  posterUrl?: string | null
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
const uploads = useMediaUpload()
const editor = useMediaEditor()
const input = useTemplateRef<HTMLInputElement>('file')
const libraryOpen = ref(false)

function patch(key: string, values: Partial<UploadItem>) {
  items.value = items.value.map(item => item.key === key ? { ...item, ...values } : item)
}

function fromView(media: MediaView): Partial<UploadItem> {
  return {
    mediaId: media.id, status: media.status, error: media.error, width: media.width, height: media.height, durationMs: media.durationMs,
    mime: media.mime, bytes: media.bytes, posterUrl: media.posterUrl, kind: media.kind,
    previewUrl: media.url ?? media.posterUrl ?? null
  }
}

async function waitReady(key: string, mediaId: string) {
  const media = await uploads.waitReady(mediaId)
  if (!media) return
  const current = items.value.find(i => i.key === key)
  patch(key, { ...fromView(media), previewUrl: media.url ?? current?.previewUrl ?? null })
}

async function upload(file: File) {
  const key = `${Date.now()}-${Math.random()}`
  const kind = file.type.startsWith('video/') ? 'video' : 'image'
  items.value = [...items.value, { key, mediaId: null, previewUrl: kind === 'image' ? URL.createObjectURL(file) : null, kind, mime: file.type, bytes: file.size, status: 'uploading', progress: 0, error: null }]
  try {
    const mediaId = await uploads.upload(file, { filename: file.name, onUploaded: id => patch(key, { mediaId: id }), onProgress: progress => patch(key, { progress }) })
    patch(key, { status: 'processing' })
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

/** Opens the editor; the edited copy takes the same place, so a carousel keeps its order. */
async function edit(key: string, aspect?: Aspect) {
  const item = items.value.find(i => i.key === key)
  if (!item?.mediaId || item.status !== 'ready') return
  const mediaId = await editor.edit({ mediaId: item.mediaId, aspect })
  if (!mediaId) return
  patch(key, { mediaId, status: 'processing', progress: 100, error: null })
  await waitReady(key, mediaId)
}

/** Attaches media already in Galeri Media (no new upload). */
function addFromLibrary(picked: MediaView[]) {
  const room = (props.max ?? 10) - items.value.length
  const added = picked.slice(0, Math.max(0, room)).map(media => ({ key: `${Date.now()}-${Math.random()}`, progress: 100, ...fromView(media) }) as UploadItem)
  items.value = [...items.value, ...added]
}

defineExpose({ edit, addFromLibrary })
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
        <img
          v-else-if="item.posterUrl && item.kind === 'video'"
          :src="item.posterUrl"
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
        <UIcon
          v-if="item.kind === 'video' && item.status === 'ready'"
          name="i-lucide-play"
          class="absolute bottom-1.5 left-1.5 size-4 text-white drop-shadow"
        />
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
          v-if="item.status === 'ready' && item.mediaId"
          icon="i-lucide-wand-sparkles"
          size="xs"
          color="neutral"
          variant="solid"
          class="absolute top-1 left-1 rounded-full"
          :aria-label="t('mediaEditor.open')"
          @click="edit(item.key)"
        />
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
    <UButton
      v-if="items.length < (max ?? 10)"
      icon="i-lucide-images"
      :label="t('mediaLibrary.pickFrom')"
      color="neutral"
      variant="link"
      size="sm"
      class="px-0"
      @click="libraryOpen = true"
    />
    <input
      ref="file"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,video/mp4,video/quicktime"
      class="hidden"
      @change="onFiles"
    >
    <MediaLibraryPicker
      v-if="libraryOpen"
      v-model:open="libraryOpen"
      :max="(max ?? 10) - items.length"
      @pick="addFromLibrary"
    />
  </div>
</template>
