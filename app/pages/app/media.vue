<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { MediaView } from '#shared/media/types'
import { IDEA_MAX_MEDIA } from '#shared/utils/planner'

/** Galeri Media (docs/SCREENS.md #19): every photo and video, storage used, edit a copy, reuse in a post, delete. */
definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const entitlements = useEntitlements()
const editor = useMediaEditor()
const uploads = useMediaUpload()
const undo = useUndoToast()
const auth = useCreatorAuth()
useHead({ title: () => t('mediaLibrary.title') })

const kind = ref<'all' | 'image' | 'video'>('all')
const filters = computed(() => (kind.value === 'all' ? {} : { kind: kind.value }))
const list = useServerList<MediaView>('/api/app/media', { filters, limit: 24 })
const storage = computed(() => list.extra.value.storage as { usedBytes: number, limitMb: number } | undefined)
const storagePercent = computed(() => {
  const s = storage.value
  if (!s || s.limitMb <= 0) return 0
  return Math.min(100, Math.round((s.usedBytes / (s.limitMb * 1024 * 1024)) * 100))
})
// The bar fills from empty when the numbers arrive; at 90 % it glows once.
const shownPercent = ref(0)
watch(storagePercent, (value) => {
  requestAnimationFrame(() => {
    shownPercent.value = value
  })
}, { immediate: true })
const canManage = computed(() => auth.hasAbility('media.manage'))
onMounted(() => list.refresh())

/** Rows still processing (an edit or a fresh upload) are refreshed until they are done. */
let poll: ReturnType<typeof setTimeout> | undefined
watch(list.items, (items) => {
  clearTimeout(poll)
  if (items.some(m => m.status === 'processing')) poll = setTimeout(() => list.refresh(), 3000)
})
onBeforeUnmount(() => clearTimeout(poll))

const input = useTemplateRef<HTMLInputElement>('file')
const root = useTemplateRef<HTMLElement>('root')
const desktop = useMediaQuery('(min-width: 1024px)')

// Uploads in flight, one ring each (several files at once, dropped, pasted or picked).
interface Upload { key: string, name: string, progress: number }
const inflight = ref<Upload[]>([])
async function uploadFiles(files: File[]) {
  if (!canManage.value || !files.length) return
  await Promise.all(files.map(async (file) => {
    const key = `${Date.now()}-${Math.random()}`
    inflight.value = [...inflight.value, { key, name: file.name, progress: 0 }]
    try {
      await uploads.upload(file, { filename: file.name, onProgress: (progress) => {
        inflight.value = inflight.value.map(u => u.key === key ? { ...u, progress } : u)
      } })
    } catch (caught) {
      if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
    } finally {
      inflight.value = inflight.value.filter(u => u.key !== key)
    }
  }))
  await list.refresh()
}
function onFiles(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  if (input.value) input.value.value = ''
  void uploadFiles(files)
}
const { isOver } = useFileDrop(root, { accept: ['image/', 'video/'], multiple: true, paste: true, onFiles: uploadFiles })

async function edit(media: MediaView) {
  sheetMedia.value = null
  const mediaId = await editor.edit({ mediaId: media.id })
  if (!mediaId) return
  toast.add({ title: t('mediaLibrary.editSaved'), color: 'success' })
  await list.refresh()
}

// Deleting hides the tile at once and commits after the undo window; a refusal (still in a post or Etalase) brings it back.
const hidden = ref<string[]>([])
const visible = computed(() => list.items.value.filter(m => !hidden.value.includes(m.id)))
function removeMany(ids: string[]) {
  const title = ids.length > 1 ? t('mediaLibrary.deletedMany', { n: ids.length }) : t('mediaLibrary.deletedUndo')
  void undo.run({
    title,
    apply: () => {
      hidden.value = [...new Set([...hidden.value, ...ids])]
      picked.value = picked.value.filter(id => !ids.includes(id))
      if (!picked.value.length) selecting.value = false
    },
    rollback: () => {
      hidden.value = hidden.value.filter(id => !ids.includes(id))
    },
    commit: async () => {
      const results = await Promise.allSettled(ids.map(id => apiFetch(`/api/app/media/${id}`, { method: 'DELETE' })))
      await list.refresh()
      hidden.value = hidden.value.filter(id => !ids.includes(id))
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed) throw failed.reason
    }
  })
}
function remove(media: MediaView) {
  sheetMedia.value = null
  removeMany([media.id])
}

// "Jadikan ide": batch-shot photos and videos become content ideas (Rencana konten), spread over empty days.
const canPlan = computed(() => auth.hasAbility('posts.write'))
const selecting = ref(false)
const picked = ref<string[]>([])
const ideaDialog = ref(false)
const ideaMode = ref<'each' | 'one'>('each')
const makingIdeas = ref(false)
function toggleSelecting() {
  ideaSelect.value = !ideaSelect.value
  selecting.value = ideaSelect.value
  picked.value = []
}
function togglePick(media: MediaView) {
  if (media.status !== 'ready') return
  if (picked.value.includes(media.id)) picked.value = picked.value.filter(id => id !== media.id)
  else if (picked.value.length < IDEA_MAX_MEDIA) picked.value = [...picked.value, media.id]
  else toast.add({ title: t('mediaLibrary.toIdeas.max', { n: IDEA_MAX_MEDIA }), color: 'warning' })
  selecting.value = picked.value.length > 0 || ideaSelect.value
}
// "Jadikan ide" opens select mode on purpose; a long press or a checkbox opens it too and closes it when the last pick goes.
const ideaSelect = ref(false)
const sheetMedia = ref<MediaView | null>(null)
const sheetOpen = computed({
  get: () => Boolean(sheetMedia.value),
  set: (value) => {
    if (!value) sheetMedia.value = null
  }
})
const useInPostTo = computed(() => localePath({ path: '/app/compose', query: { media: picked.value.join(',') } }))
const modeItems = computed(() => [
  { value: 'each', label: t('mediaLibrary.toIdeas.each'), description: t('mediaLibrary.toIdeas.eachHint') },
  { value: 'one', label: t('mediaLibrary.toIdeas.one'), description: t('mediaLibrary.toIdeas.oneHint') }
])
async function makeIdeas() {
  makingIdeas.value = true
  try {
    const { items } = await apiFetch<{ items: { id: string, plannedOn: string | null }[] }>('/api/app/planner/ideas/from-media', {
      method: 'POST', body: { mediaIds: picked.value, mode: ideaMode.value, locale: locale.value === 'en' ? 'en' : 'id' }
    })
    const firstDay = items.find(item => item.plannedOn)?.plannedOn
    toast.add({
      title: firstDay ? t('mediaLibrary.toIdeas.doneDated', { n: items.length }) : t('mediaLibrary.toIdeas.doneBank', { n: items.length }),
      color: 'success',
      actions: [{ label: t('mediaLibrary.toIdeas.openCalendar'), to: localePath({ path: '/app/calendar', query: firstDay ? { day: firstDay } : {} }), color: 'neutral', variant: 'outline' }]
    })
    ideaDialog.value = false
    ideaSelect.value = false
    selecting.value = false
    picked.value = []
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    makingIdeas.value = false
  }
}
</script>

<template>
  <div
    ref="root"
    class="w-full max-w-5xl mx-auto"
    :class="selecting ? 'pb-16 lg:pb-0' : ''"
  >
    <CommandBar
      :title="t('mediaLibrary.title')"
      :description="t('mediaLibrary.subtitle')"
    >
      <UButton
        v-if="canPlan && list.items.value.length"
        icon="i-lucide-lightbulb"
        :color="ideaSelect ? 'primary' : 'neutral'"
        :variant="ideaSelect ? 'soft' : 'outline'"
        :label="ideaSelect ? t('common.cancel') : t('mediaLibrary.toIdeas.select')"
        @click="toggleSelecting"
      />
      <UButton
        v-if="canManage && !selecting"
        icon="i-lucide-upload"
        :label="t('mediaLibrary.upload')"
        :loading="inflight.length > 0"
        @click="input?.click()"
      />
    </CommandBar>
    <div
      v-if="selecting && ideaSelect"
      class="flex flex-wrap items-center gap-2 text-sm text-muted mb-3"
    >
      <span>{{ t('mediaLibrary.toIdeas.selectHint', { n: IDEA_MAX_MEDIA }) }}</span>
      <UButton
        v-if="picked.length"
        size="xs"
        variant="soft"
        icon="i-lucide-lightbulb"
        :label="t('mediaLibrary.toIdeas.confirm', { n: picked.length })"
        @click="ideaDialog = true"
      />
    </div>

    <div
      v-if="inflight.length"
      class="mb-4 rounded-md border border-default p-3"
    >
      <p class="text-xs font-medium text-muted mb-2">
        {{ t('mediaLibrary.uploads') }}
      </p>
      <ul class="flex flex-wrap gap-3">
        <li
          v-for="item in inflight"
          :key="item.key"
          class="flex items-center gap-2 text-sm min-w-0"
        >
          <ProgressRing
            :value="item.progress"
            :size="22"
            :stroke="3"
            class="text-primary"
          />
          <span class="max-w-40 truncate">{{ item.name }}</span>
          <span class="text-xs text-muted tabular-nums">{{ item.progress }}%</span>
        </li>
      </ul>
    </div>

    <div class="flex flex-wrap items-center gap-3 mb-4">
      <UTabs
        v-model="kind"
        :items="[{ value: 'all', label: t('mediaLibrary.kind.all') }, { value: 'image', label: t('mediaLibrary.kind.image') }, { value: 'video', label: t('mediaLibrary.kind.video') }]"
        :content="false"
        size="sm"
      />
      <div
        v-if="storage"
        class="ms-auto w-full sm:w-64 space-y-1"
      >
        <div class="flex justify-between text-xs text-muted">
          <span>{{ t('mediaLibrary.storage') }}</span>
          <span class="tabular-nums">
            {{ formatBytes(storage.usedBytes, locale) }}{{ storage.limitMb > 0 ? ` / ${formatBytes(storage.limitMb * 1024 * 1024, locale)}` : '' }}
          </span>
        </div>
        <UProgress
          v-if="storage.limitMb > 0"
          :model-value="shownPercent"
          size="sm"
          :class="storagePercent >= 90 ? 'animate-glow rounded-full' : ''"
          :ui="{ indicator: 'motion-safe:transition-all motion-safe:duration-700' }"
          :color="storagePercent >= 90 ? 'error' : storagePercent >= 75 ? 'warning' : 'primary'"
        />
      </div>
    </div>

    <Transition
      name="fade"
      mode="out-in"
    >
      <div
        v-if="list.status.value === 'loading' && !list.items.value.length"
        key="loading"
        class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2"
      >
        <USkeleton
          v-for="n in 12"
          :key="n"
          class="aspect-square"
        />
      </div>
      <UCard
        v-else-if="!visible.length"
        key="empty"
      >
        <EmptyState
          icon="i-lucide-images"
          :title="t('mediaLibrary.emptyTitle')"
          :description="t('mediaLibrary.emptyBody')"
          :action="canManage ? { label: t('mediaLibrary.upload'), icon: 'i-lucide-upload', onClick: () => input?.click() } : undefined"
        >
          <div
            v-if="canManage"
            class="w-full max-w-sm rounded-lg border-2 border-dashed border-default px-4 py-5 text-center text-sm text-muted"
          >
            <UIcon
              name="i-lucide-image-plus"
              class="size-6 mx-auto mb-1"
            />
            {{ t('drop.here') }}
            <span class="hidden lg:inline">· {{ t('drop.pasteHint') }}</span>
          </div>
        </EmptyState>
      </UCard>
      <TransitionGroup
        v-else
        key="grid"
        name="list"
        tag="div"
        class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2"
      >
        <MediaGalleryItem
          v-for="media in visible"
          :key="media.id"
          :media="media"
          :selecting="selecting"
          :picked="picked.includes(media.id)"
          :can-manage="canManage"
          :desktop="desktop"
          @toggle="togglePick(media)"
          @open="sheetMedia = media"
          @edit="edit(media)"
          @use="navigateTo(localePath({ path: '/app/compose', query: { media: media.id } }))"
          @remove="remove(media)"
        />
      </TransitionGroup>
    </Transition>
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

    <StickyActionBar v-if="selecting && picked.length && !ideaSelect">
      <template #leading>
        {{ t('mediaLibrary.selectedCount', { n: picked.length }) }}
      </template>
      <UButton
        color="error"
        variant="outline"
        icon="i-lucide-trash-2"
        :label="t('common.remove')"
        @click="removeMany(picked)"
      />
      <UButton
        icon="i-lucide-square-pen"
        :label="t('mediaLibrary.usePost')"
        :to="useInPostTo"
      />
    </StickyActionBar>

    <ResponsiveSheet
      v-model:open="sheetOpen"
      :title="t('mediaLibrary.actionsTitle')"
    >
      <template #body>
        <div
          v-if="sheetMedia"
          class="flex flex-col gap-2"
        >
          <UButton
            block
            color="neutral"
            variant="outline"
            icon="i-lucide-wand-sparkles"
            :disabled="sheetMedia.status !== 'ready'"
            :label="t('mediaEditor.open')"
            @click="edit(sheetMedia)"
          />
          <UButton
            block
            color="neutral"
            variant="outline"
            icon="i-lucide-square-pen"
            :disabled="sheetMedia.status !== 'ready'"
            :label="t('mediaLibrary.usePost')"
            :to="localePath({ path: '/app/compose', query: { media: sheetMedia.id } })"
          />
          <UButton
            block
            color="neutral"
            variant="outline"
            icon="i-lucide-check-check"
            :disabled="sheetMedia.status !== 'ready'"
            :label="t('mediaLibrary.selectMany')"
            @click="togglePick(sheetMedia); sheetMedia = null"
          />
          <UButton
            block
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :label="t('common.remove')"
            @click="remove(sheetMedia)"
          />
        </div>
      </template>
    </ResponsiveSheet>

    <UModal
      v-model:open="ideaDialog"
      :title="t('mediaLibrary.toIdeas.dialogTitle')"
    >
      <template #body>
        <URadioGroup
          v-model="ideaMode"
          :items="picked.length > 1 ? modeItems : modeItems.slice(0, 1)"
          variant="card"
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="ideaDialog = false"
          />
          <UButton
            :loading="makingIdeas"
            :label="t('mediaLibrary.toIdeas.confirm', { n: picked.length })"
            @click="makeIdeas"
          />
        </div>
      </template>
    </UModal>
    <input
      ref="file"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,video/mp4,video/quicktime"
      class="hidden"
      @change="onFiles"
    >
    <Transition name="fade">
      <div
        v-if="isOver && canManage"
        class="fixed inset-0 z-50 grid place-items-center bg-primary/10 backdrop-blur-[1px] pointer-events-none"
      >
        <span class="flex items-center gap-2 rounded-full bg-default px-5 py-3 text-sm font-medium text-primary shadow-lg">
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
