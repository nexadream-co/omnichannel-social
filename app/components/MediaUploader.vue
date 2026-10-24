<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'
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
const props = defineProps<{ max?: number, card?: boolean, title?: string, paste?: boolean }>()
const { t } = useI18n()
const toast = useToast()
const entitlements = useEntitlements()
const uploads = useMediaUpload()
const editor = useMediaEditor()
const input = useTemplateRef<HTMLInputElement>('file')
const libraryOpen = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const grid = useTemplateRef<HTMLElement>('grid')
const reduced = usePreferredReducedMotion()

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

/** Starts an upload for each file that fits; the rest are dropped with one friendly note. */
function addFiles(files: File[]) {
  const room = (props.max ?? 10) - items.value.length
  if (files.length > room) toast.add({ title: t('channel.tooManyMedia', { max: props.max ?? 10 }), color: 'warning' })
  files.slice(0, Math.max(0, room)).forEach(upload)
}

function onFiles(event: Event) {
  addFiles([...((event.target as HTMLInputElement).files ?? [])])
  if (input.value) input.value.value = ''
}

const { isOver } = useFileDrop(root, { accept: ['image/', 'video/'], multiple: true, paste: props.paste, onFiles: addFiles })

// Carousel order: hold a thumbnail (300 ms on a phone) and drag it; the first one is the cover.
useSortable(grid, items, {
  draggable: '.sortable-item',
  handle: '.sort-thumb',
  filter: 'button',
  delay: 300,
  delayOnTouchOnly: true,
  animation: reduced.value === 'reduce' ? 0 : 200,
  ghostClass: 'opacity-40',
  onStart: () => haptic('tick'),
  onUpdate: (event: { oldIndex?: number, newIndex?: number }) => {
    if (event.oldIndex === undefined || event.newIndex === undefined) return
    const next = [...items.value]
    moveArrayElement(next, event.oldIndex, event.newIndex, event as never)
    items.value = next
  }
})

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

defineExpose({ edit, addFromLibrary, addFiles })
</script>

<template>
  <div
    ref="root"
    class="relative space-y-2"
    :class="card ? 'rounded-lg bg-default ring ring-default p-4 sm:p-6' : ''"
  >
    <p
      v-if="title"
      class="text-sm font-medium mb-2"
    >
      {{ title }}
    </p>
    <div
      ref="grid"
      class="grid grid-cols-3 sm:grid-cols-4 gap-2"
    >
      <div
        v-for="(item, index) in items"
        :key="item.key"
        class="sortable-item relative aspect-square rounded-md overflow-hidden bg-elevated border border-default"
      >
        <div class="sort-thumb absolute inset-0 touch-manipulation motion-safe:cursor-grab">
          <SmartImage
            v-if="item.kind === 'image' ? item.previewUrl : item.posterUrl"
            :src="item.kind === 'image' ? item.previewUrl : item.posterUrl"
            kind="media"
            class="size-full"
          />
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
        </div>
        <UIcon
          v-if="item.kind === 'video' && item.status === 'ready'"
          name="i-lucide-play"
          class="absolute bottom-1.5 left-1.5 size-4 text-white drop-shadow pointer-events-none"
        />
        <UBadge
          v-if="index === 0 && items.length > 1"
          :label="t('composer.cover')"
          size="sm"
          color="neutral"
          variant="solid"
          class="absolute bottom-1 left-1 pointer-events-none"
        />
        <div
          v-if="item.status === 'uploading' || item.status === 'processing'"
          class="absolute inset-0 bg-default/70 flex flex-col items-center justify-center gap-1 text-xs text-default pointer-events-none"
        >
          <ProgressRing
            v-if="item.status === 'uploading'"
            :value="item.progress"
            :size="32"
            :stroke="3"
            class="text-primary"
            :label="t('composer.uploading', { percent: item.progress })"
          />
          <UIcon
            v-else
            name="i-lucide-loader-circle"
            class="size-6 text-primary motion-safe:animate-spin"
          />
          <span class="tabular-nums">{{ item.status === 'uploading' ? `${item.progress}%` : t('composer.processing') }}</span>
        </div>
        <div
          v-if="item.status === 'failed'"
          class="absolute inset-0 bg-error/85 text-inverted text-xs p-2 flex items-center text-center pointer-events-none"
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
    <p
      v-if="paste && items.length < (max ?? 10)"
      class="hidden lg:block text-xs text-muted"
    >
      {{ t('drop.pasteHint') }}
    </p>
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
    <Transition name="fade">
      <div
        v-if="isOver"
        class="absolute inset-0 z-10 grid place-items-center rounded-[inherit] border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px] pointer-events-none"
      >
        <span class="flex items-center gap-2 text-sm font-medium text-primary">
          <UIcon
            name="i-lucide-image-plus"
            class="size-5"
          />
          {{ t('drop.here') }}
        </span>
      </div>
    </Transition>
  </div>
</template>
