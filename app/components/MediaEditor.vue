<script setup lang="ts">
import { cssFilter } from '#shared/media/adjust'
import { ASPECT_RATIO, defaultSpec, editedDurationMs, FULL_CROP, isNoopSpec, outputSize, type Aspect, type Crop, type EditSpec, type Layer } from '#shared/media/edit-spec'
import { stickerById, TEXT_FONT_META } from '#shared/media/presets'
import type { MediaView } from '#shared/media/types'
import { centeredCrop, contentRect, coverRect, cropLock, placeSource, previewFrame, sourceStyle, type Size } from '~/utils/media-editor/layout'
import { EditorOverlay } from '~/utils/media-editor/overlay'
import { canvasBlob, loadImage, renderImage } from '~/utils/media-editor/render'
import type { MediaEditorRequest } from '~/composables/useMediaEditor'

/**
 * Full-screen photo/video editor (ARCHITECTURE §8.5). Lazy-loaded by <MediaEditorHost />. Saving makes a new copy:
 * photos are rendered here and uploaded, videos are rendered by the media processor from the same recipe.
 */
type Tab = 'trim' | 'crop' | 'adjust' | 'filter' | 'text' | 'sticker' | 'logo' | 'cover' | 'sound'

const props = defineProps<{ request: MediaEditorRequest }>()
const emit = defineEmits<{ done: [mediaId: string | null] }>()
const { t } = useI18n()
const toast = useToast()
const entitlements = useEntitlements()
const uploads = useMediaUpload()
const { confirm } = useConfirmDialog()

const loading = ref(true)
const loadError = ref<string | null>(null)
const source = ref<MediaView | null>(null)
const sourceSize = ref<Size>({ width: 1, height: 1 })
const spec = ref<EditSpec>(defaultSpec('image'))
const tab = ref<Tab>('crop')
const selectedId = ref<string | null>(null)
const saving = ref(false)
const savingPercent = ref<number | null>(null)
const image = shallowRef<HTMLImageElement | null>(null)
const video = useTemplateRef<HTMLVideoElement>('video')
const backdrop = useTemplateRef<HTMLVideoElement>('backdrop')
const area = useTemplateRef<HTMLDivElement>('area')
const overlayHost = useTemplateRef<HTMLDivElement>('overlayHost')
const areaSize = ref<Size>({ width: 320, height: 320 })
const playing = ref(false)
/** The recipe as it was opened (an edited copy restores its own), to tell real changes apart. */
const openedSpec = ref('')
const changed = computed(() => JSON.stringify(spec.value) !== openedSpec.value)
let overlay: EditorOverlay | null = null
let observer: ResizeObserver | null = null

const isVideo = computed(() => spec.value.kind === 'video')
const durationMs = computed(() => source.value?.durationMs ?? 0)
const cropping = computed(() => tab.value === 'crop')
const tabs = computed(() => {
  const all: { id: Tab, icon: string, video?: boolean }[] = [
    { id: 'trim', icon: 'i-lucide-scissors', video: true },
    { id: 'crop', icon: 'i-lucide-crop' },
    { id: 'adjust', icon: 'i-lucide-sun-medium' },
    { id: 'filter', icon: 'i-lucide-sparkles' },
    { id: 'text', icon: 'i-lucide-type' },
    { id: 'sticker', icon: 'i-lucide-sticker' },
    { id: 'logo', icon: 'i-lucide-stamp' },
    { id: 'cover', icon: 'i-lucide-image', video: true },
    { id: 'sound', icon: 'i-lucide-volume-2', video: true }
  ]
  return all.filter(item => !item.video || isVideo.value)
})

const frame = computed(() => previewFrame(spec.value, sourceSize.value, areaSize.value, cropping.value))
const filter = computed(() => cssFilter(spec.value.adjust))
const mediaStyle = computed(() => {
  const target = cropping.value ? { x: 0, y: 0, ...frame.value } : contentRect(spec.value, sourceSize.value, frame.value)
  return sourceStyle(spec.value, placeSource(spec.value, sourceSize.value, target, cropping.value), cropping.value ? 'none' : filter.value)
})
const showBackdrop = computed(() => !cropping.value && spec.value.fit === 'blur')
const backdropStyle = computed(() => {
  const out = outputSize(spec.value, sourceSize.value.width, sourceSize.value.height)
  const blur = Math.max(4, 40 * (frame.value.width / out.width))
  const placed = placeSource(spec.value, sourceSize.value, coverRect(spec.value, sourceSize.value, frame.value))
  return sourceStyle(spec.value, placed, `${filter.value === 'none' ? '' : filter.value} blur(${blur.toFixed(1)}px)`)
})
const selectedLayer = computed(() => spec.value.layers.find(l => l.id === selectedId.value) ?? null)

function layerId() {
  return Math.random().toString(36).slice(2, 10)
}

async function loadFonts() {
  if (!import.meta.client || !document.fonts) return
  await Promise.allSettled(Object.values(TEXT_FONT_META).map(f => document.fonts.load(`${f.weight} 48px "${f.family}"`)))
  overlay?.refresh()
}

function applyAspect(aspect: Aspect) {
  const s = spec.value
  s.aspect = aspect
  if (s.fit === 'blur' && ASPECT_RATIO[aspect] === null) s.fit = 'crop'
  s.crop = s.fit === 'blur' || aspect === 'free' || aspect === 'original' ? { ...FULL_CROP } : centeredCrop(ASPECT_RATIO[aspect], sourceSize.value, s.rotate)
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const target = await apiFetch<MediaView>(`/api/app/media/${props.request.mediaId}`)
    let root = target
    let restored: EditSpec | null = null
    // An edited copy re-opens on its untouched source with the recipe, so every step can still be undone.
    if (target.sourceMediaId && target.editSpec) {
      try {
        root = await apiFetch<MediaView>(`/api/app/media/${target.sourceMediaId}`)
        restored = structuredClone(toRaw(target.editSpec))
      } catch {
        root = target
      }
    }
    if (root.status !== 'ready' || !root.url) throw new Error(t('mediaEditor.notReady'))
    source.value = root
    spec.value = restored ?? defaultSpec(root.kind)
    if (root.kind === 'image') {
      try {
        image.value = await loadImage(root.url)
      } catch {
        throw new Error(t('mediaEditor.cannotOpen'))
      }
      sourceSize.value = { width: image.value.naturalWidth, height: image.value.naturalHeight }
    } else {
      sourceSize.value = { width: root.width ?? 1080, height: root.height ?? 1920 }
      spec.value.trim ??= { startMs: 0, endMs: root.durationMs ?? 0 }
    }
    openedSpec.value = JSON.stringify(spec.value)
    if (props.request.aspect) {
      applyAspect(props.request.aspect)
      tab.value = 'crop'
    } else {
      tab.value = root.kind === 'video' ? 'trim' : 'crop'
    }
  } catch (caught) {
    loadError.value = caught instanceof Error && !('statusCode' in caught) ? caught.message : extractErrorMessage(caught, t('authError.generic'))
  } finally {
    loading.value = false
  }
}

function mountOverlay() {
  if (overlay || !overlayHost.value) return
  overlay = new EditorOverlay(overlayHost.value, {
    onLayerChange: (layer) => {
      spec.value.layers = spec.value.layers.map(l => (l.id === layer.id ? layer : l))
    },
    onSelect: (id) => {
      selectedId.value = id
      const layer = spec.value.layers.find(l => l.id === id)
      if (layer && !cropping.value) tab.value = layer.type === 'watermark' ? 'logo' : layer.type
    },
    onEditText: (id) => {
      selectedId.value = id
      tab.value = 'text'
      nextTick(() => document.getElementById('media-editor-text')?.focus())
    },
    onCropChange: (crop: Crop) => {
      spec.value.crop = crop
    },
    stickerLabel: id => t(stickerById(id)?.labelKey ?? 'mediaEditor.sticker.promo')
  })
  overlay.resize(frame.value)
  overlay.setLayers(spec.value.layers)
  syncCrop()
  loadFonts()
}

function syncCrop() {
  if (!overlay) return
  if (cropping.value) overlay.showCrop(spec.value.crop, cropLock(spec.value, sourceSize.value))
  else overlay.hideCrop()
}

watch(frame, (value) => {
  overlay?.resize(value)
  syncCrop()
})
watch(() => spec.value.layers, layers => overlay?.setLayers(layers), { deep: true })
watch(cropping, syncCrop)
watch(loading, (value) => {
  if (!value && !loadError.value) nextTick(mountOverlay)
})

function rotate() {
  const s = spec.value
  s.rotate = ((s.rotate + 90) % 360) as EditSpec['rotate']
  applyAspect(s.aspect)
  syncCrop()
}

function toggleBlur(on: boolean) {
  spec.value.fit = on ? 'blur' : 'crop'
  applyAspect(spec.value.aspect)
  syncCrop()
}

function setAspect(aspect: Aspect) {
  applyAspect(aspect)
  syncCrop()
}

function addLayer(layer: Layer) {
  spec.value.layers = [...spec.value.layers, layer]
  nextTick(() => overlay?.select(layer.id))
}

function addText() {
  addLayer({ type: 'text', id: layerId(), x: 0.5, y: 0.5, scale: 1, rotation: 0, text: t('mediaEditor.text.placeholder'), font: 'jakarta', style: 'box', color: '#ffffff', size: 0.07 })
  nextTick(() => document.getElementById('media-editor-text')?.focus())
}

function addSticker(stickerId: string) {
  const def = stickerById(stickerId)
  if (!def) return
  const index = spec.value.layers.filter(l => l.type === 'sticker').length
  addLayer({ type: 'sticker', id: layerId(), x: 0.5, y: Math.min(0.85, 0.3 + index * 0.08), scale: 1, rotation: def.shape === 'emoji' ? 0 : -6, sticker: def.id, ...(def.labelKey ? { label: t(def.labelKey) } : {}) })
}

function addLogo(watermark: { url: string, position: string, scale: number, opacity: number }) {
  const existing = spec.value.layers.find(l => l.type === 'watermark')
  const spot: Record<string, [number, number]> = { 'top-left': [0.14, 0.08], 'top-right': [0.86, 0.08], 'bottom-left': [0.14, 0.92], 'bottom-right': [0.86, 0.92], 'center': [0.5, 0.5] }
  const [x, y] = spot[watermark.position] ?? [0.86, 0.92]
  const layer: Layer = { type: 'watermark', id: existing?.id ?? layerId(), x, y, scale: watermark.scale / 0.18, rotation: 0, url: watermark.url, opacity: watermark.opacity }
  if (existing) spec.value.layers = spec.value.layers.map(l => (l.id === existing.id ? layer : l))
  else addLayer(layer)
}

function updateLayer(layer: Layer) {
  spec.value.layers = spec.value.layers.map(l => (l.id === layer.id ? layer : l))
}

function removeSelected() {
  if (!selectedId.value) return
  spec.value.layers = spec.value.layers.filter(l => l.id !== selectedId.value)
  overlay?.select(null)
}

/* Video preview: loops inside the trimmed part; the cover tab shows the chosen frame. */
const trimStart = computed(() => (spec.value.trim?.startMs ?? 0) / 1000)
const trimEnd = computed(() => (spec.value.trim?.endMs ?? durationMs.value) / 1000)

function onTimeUpdate() {
  const el = video.value
  if (!el) return
  if (el.currentTime >= trimEnd.value || el.currentTime < trimStart.value - 0.25) el.currentTime = trimStart.value
  if (backdrop.value && Math.abs(backdrop.value.currentTime - el.currentTime) > 0.3) backdrop.value.currentTime = el.currentTime
}

function seek(seconds: number) {
  for (const el of [video.value, backdrop.value]) {
    if (el) el.currentTime = seconds
  }
}

async function togglePlay() {
  const el = video.value
  if (!el) return
  if (el.paused) {
    if (el.currentTime < trimStart.value || el.currentTime >= trimEnd.value) seek(trimStart.value)
    await el.play().catch(() => {})
    await backdrop.value?.play().catch(() => {})
  } else {
    el.pause()
    backdrop.value?.pause()
  }
}

watch(() => spec.value.trim?.startMs, (ms) => {
  if (ms !== undefined && tab.value === 'trim') seek(ms / 1000)
})
watch(() => spec.value.coverMs, (ms) => {
  if (ms !== undefined) seek(trimStart.value + ms / 1000)
})
watch(tab, (value) => {
  if (value === 'cover') {
    video.value?.pause()
    spec.value.coverMs ??= Math.min(1000, Math.max(0, editedDurationMs(spec.value, durationMs.value) - 100))
    seek(trimStart.value + (spec.value.coverMs ?? 0) / 1000)
  }
})

async function save() {
  const s = source.value
  if (!s || saving.value) return
  if (!changed.value || isNoopSpec(spec.value, durationMs.value)) {
    toast.add({ title: t('mediaEditor.nothingChanged'), color: 'neutral' })
    return
  }
  saving.value = true
  savingPercent.value = null
  try {
    if (cropping.value) tab.value = 'adjust'
    overlay?.select(null)
    await nextTick()
    await loadFonts()
    const out = outputSize(spec.value, sourceSize.value.width, sourceSize.value.height)
    const drawn = overlay?.exportCanvas(out.width) ?? null
    const finished = toRaw(spec.value)
    let mediaId: string
    if (finished.kind === 'image') {
      const blob = await renderImage(image.value!, finished, drawn)
      mediaId = await uploads.upload(blob, { filename: 'edit.jpg', mime: 'image/jpeg', sourceMediaId: s.id, editSpec: finished, onProgress: p => (savingPercent.value = p) })
    } else {
      mediaId = await uploads.renderVideoEdit(s.id, finished, drawn ? await canvasBlob(drawn, 'image/png') : null)
    }
    emit('done', mediaId)
  } catch (caught) {
    if (!entitlements.handlePlanError(caught)) {
      const security = caught instanceof DOMException && caught.name === 'SecurityError'
      toast.add({ title: security ? t('mediaEditor.cannotOpen') : extractErrorMessage(caught, t('mediaEditor.saveFailed')), color: 'error' })
    }
  } finally {
    saving.value = false
  }
}

async function cancel() {
  if (source.value && changed.value && !(await confirm({ title: t('mediaEditor.discardTitle'), description: t('mediaEditor.discardBody'), confirmLabel: t('mediaEditor.discard'), color: 'error' }))) return
  emit('done', null)
}

onMounted(load)
// The modal renders its content after mounting, so the preview area is measured once it exists.
watch(area, (el) => {
  observer?.disconnect()
  if (!el) return
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return
    areaSize.value = { width: Math.max(160, entry.contentRect.width - 24), height: Math.max(160, entry.contentRect.height - 24) }
  })
  observer.observe(el)
}, { immediate: true })
onBeforeUnmount(() => {
  observer?.disconnect()
  overlay?.destroy()
  overlay = null
})
</script>

<template>
  <UModal
    :open="true"
    fullscreen
    :dismissible="false"
    :title="isVideo ? t('mediaEditor.titleVideo') : t('mediaEditor.titleImage')"
    :description="t('mediaEditor.description')"
  >
    <template #content>
      <div class="h-full flex flex-col bg-default">
        <header class="flex items-center gap-2 px-3 h-14 border-b border-default shrink-0">
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.cancel')"
            :disabled="saving"
            @click="cancel"
          />
          <h2 class="flex-1 font-semibold truncate">
            {{ isVideo ? t('mediaEditor.titleVideo') : t('mediaEditor.titleImage') }}
          </h2>
          <UButton
            :label="t('mediaEditor.save')"
            :loading="saving"
            :disabled="loading || Boolean(loadError)"
            @click="save"
          />
        </header>

        <div
          ref="area"
          class="relative flex-1 min-h-0 bg-neutral-900 flex items-center justify-center overflow-hidden select-none"
        >
          <div
            v-if="loading"
            class="flex flex-col items-center gap-2 text-neutral-300 text-sm"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-6 motion-safe:animate-spin"
            />
            {{ t('common.loading') }}
          </div>
          <div
            v-else-if="loadError"
            class="max-w-sm px-6 text-center text-neutral-200 space-y-3"
          >
            <UIcon
              name="i-lucide-image-off"
              class="size-8"
            />
            <p class="text-sm">
              {{ loadError }}
            </p>
            <UButton
              color="neutral"
              variant="subtle"
              :label="t('common.retry')"
              @click="load"
            />
          </div>
          <div
            v-else
            class="relative overflow-hidden bg-black shadow-lg"
            :style="{ width: `${frame.width}px`, height: `${frame.height}px` }"
          >
            <template v-if="source">
              <template v-if="showBackdrop">
                <img
                  v-if="!isVideo"
                  :src="image?.src"
                  alt=""
                  crossorigin="anonymous"
                  class="absolute left-0 top-0 max-w-none pointer-events-none"
                  :style="backdropStyle"
                >
                <video
                  v-else
                  ref="backdrop"
                  :src="source.url ?? undefined"
                  class="absolute left-0 top-0 max-w-none pointer-events-none"
                  :style="backdropStyle"
                  muted
                  playsinline
                  preload="auto"
                />
              </template>
              <img
                v-if="!isVideo"
                :src="image?.src"
                alt=""
                crossorigin="anonymous"
                class="absolute left-0 top-0 max-w-none pointer-events-none"
                :style="mediaStyle"
              >
              <video
                v-else
                ref="video"
                :src="source.url ?? undefined"
                class="absolute left-0 top-0 max-w-none pointer-events-none"
                :style="mediaStyle"
                :muted="spec.mute"
                playsinline
                preload="auto"
                @timeupdate="onTimeUpdate"
                @play="playing = true"
                @pause="playing = false"
                @loadedmetadata="seek(trimStart)"
              />
            </template>
            <div
              ref="overlayHost"
              class="absolute inset-0"
            />
          </div>
          <UButton
            v-if="isVideo && !loading && !loadError && tab !== 'cover'"
            :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
            color="neutral"
            variant="solid"
            size="lg"
            class="absolute bottom-3 left-3 rounded-full"
            :aria-label="playing ? t('mediaEditor.pause') : t('mediaEditor.play')"
            @click="togglePlay"
          />
          <UButton
            v-if="selectedLayer && !cropping"
            icon="i-lucide-trash-2"
            color="error"
            variant="solid"
            size="lg"
            class="absolute bottom-3 right-3 rounded-full"
            :aria-label="t('mediaEditor.removeLayer')"
            @click="removeSelected"
          />
          <div
            v-if="saving"
            class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 text-white text-sm"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-7 motion-safe:animate-spin"
            />
            {{ savingPercent === null ? t('mediaEditor.saving') : t('composer.uploading', { percent: savingPercent }) }}
          </div>
        </div>

        <div
          v-if="!loading && !loadError"
          class="shrink-0 border-t border-default bg-default pb-[env(safe-area-inset-bottom)]"
        >
          <div class="px-4 py-3 min-h-28 max-h-[38vh] overflow-y-auto w-full max-w-2xl mx-auto">
            <MediaEditorCropPanel
              v-if="tab === 'crop'"
              v-model:spec="spec"
              @aspect="setAspect"
              @rotate="rotate"
              @blur="toggleBlur"
            />
            <MediaEditorAdjustPanel
              v-else-if="tab === 'adjust' || tab === 'filter'"
              v-model:spec="spec"
              :mode="tab"
              :preview="image?.src ?? source?.posterUrl ?? null"
            />
            <MediaEditorTextPanel
              v-else-if="tab === 'text'"
              :layer="selectedLayer?.type === 'text' ? selectedLayer : null"
              @add="addText"
              @update="updateLayer"
            />
            <MediaEditorStickerPanel
              v-else-if="tab === 'sticker'"
              :layer="selectedLayer?.type === 'sticker' ? selectedLayer : null"
              @add="addSticker"
              @update="updateLayer"
            />
            <MediaEditorLogoPanel
              v-else-if="tab === 'logo'"
              :layer="selectedLayer?.type === 'watermark' ? selectedLayer : spec.layers.find(l => l.type === 'watermark') ?? null"
              @place="addLogo"
              @update="updateLayer"
            />
            <MediaEditorVideoPanel
              v-else
              v-model:spec="spec"
              :mode="tab"
              :duration-ms="durationMs"
            />
          </div>
          <nav class="flex gap-1 overflow-x-auto px-2 pb-2 sm:justify-center">
            <button
              v-for="item in tabs"
              :key="item.id"
              type="button"
              class="flex flex-col items-center gap-1 min-w-16 px-2 py-1.5 rounded-md text-xs transition-colors"
              :class="tab === item.id ? 'text-primary bg-primary/10' : 'text-muted hover:text-default'"
              @click="tab = item.id"
            >
              <UIcon
                :name="item.icon"
                class="size-5"
              />
              {{ t(`mediaEditor.tab.${item.id}`) }}
            </button>
          </nav>
        </div>
      </div>
    </template>
  </UModal>
</template>
