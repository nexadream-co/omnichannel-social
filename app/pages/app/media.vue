<script setup lang="ts">
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
const { confirm } = useConfirmDialog()
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
const uploading = ref(0)
async function onFiles(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  if (input.value) input.value.value = ''
  uploading.value += files.length
  await Promise.all(files.map(async (file) => {
    try {
      await uploads.upload(file, { filename: file.name })
    } catch (caught) {
      if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
    } finally {
      uploading.value--
    }
  }))
  await list.refresh()
}

async function edit(media: MediaView) {
  const mediaId = await editor.edit({ mediaId: media.id })
  if (!mediaId) return
  toast.add({ title: t('mediaLibrary.editSaved'), color: 'success' })
  await list.refresh()
}

async function remove(media: MediaView) {
  if (!(await confirm({ title: t('mediaLibrary.deleteTitle'), description: t('mediaLibrary.deleteBody'), confirmLabel: t('common.remove'), color: 'error' }))) return
  try {
    await apiFetch(`/api/app/media/${media.id}`, { method: 'DELETE' })
    toast.add({ title: t('mediaLibrary.deleted'), color: 'success' })
    await list.refresh()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}

// "Jadikan ide": batch-shot photos and videos become content ideas (Rencana konten), spread over empty days.
const canPlan = computed(() => auth.hasAbility('posts.write'))
const selecting = ref(false)
const picked = ref<string[]>([])
const ideaDialog = ref(false)
const ideaMode = ref<'each' | 'one'>('each')
const makingIdeas = ref(false)
function toggleSelecting() {
  selecting.value = !selecting.value
  picked.value = []
}
function togglePick(media: MediaView) {
  if (media.status !== 'ready') return
  if (picked.value.includes(media.id)) picked.value = picked.value.filter(id => id !== media.id)
  else if (picked.value.length < IDEA_MAX_MEDIA) picked.value = [...picked.value, media.id]
  else toast.add({ title: t('mediaLibrary.toIdeas.max', { n: IDEA_MAX_MEDIA }), color: 'warning' })
}
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
    selecting.value = false
    picked.value = []
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    makingIdeas.value = false
  }
}

function actions(media: MediaView) {
  return [
    [
      { label: t('mediaEditor.open'), icon: 'i-lucide-wand-sparkles', disabled: media.status !== 'ready', onSelect: () => edit(media) },
      { label: t('mediaLibrary.usePost'), icon: 'i-lucide-square-pen', disabled: media.status !== 'ready', to: localePath({ path: '/app/compose', query: { media: media.id } }) }
    ],
    [{ label: t('common.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(media) }]
  ]
}
</script>

<template>
  <div class="w-full max-w-5xl mx-auto">
    <CommandBar
      :title="t('mediaLibrary.title')"
      :description="t('mediaLibrary.subtitle')"
    >
      <UButton
        v-if="canPlan && list.items.value.length"
        icon="i-lucide-lightbulb"
        :color="selecting ? 'primary' : 'neutral'"
        :variant="selecting ? 'soft' : 'outline'"
        :label="selecting ? t('common.cancel') : t('mediaLibrary.toIdeas.select')"
        @click="toggleSelecting"
      />
      <UButton
        v-if="canManage && !selecting"
        icon="i-lucide-upload"
        :label="t('mediaLibrary.upload')"
        :loading="uploading > 0"
        @click="input?.click()"
      />
    </CommandBar>
    <p
      v-if="selecting"
      class="text-sm text-muted mb-3"
    >
      {{ t('mediaLibrary.toIdeas.selectHint', { n: IDEA_MAX_MEDIA }) }}
    </p>

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
          :model-value="storagePercent"
          size="sm"
          :color="storagePercent >= 90 ? 'error' : storagePercent >= 75 ? 'warning' : 'primary'"
        />
      </div>
    </div>

    <div
      v-if="list.status.value === 'loading' && !list.items.value.length"
      class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2"
    >
      <USkeleton
        v-for="n in 12"
        :key="n"
        class="aspect-square"
      />
    </div>
    <UCard
      v-else-if="!list.items.value.length"
      class="text-center"
    >
      <UIcon
        name="i-lucide-images"
        class="size-8 text-muted mx-auto"
      />
      <p class="mt-3 text-default">
        {{ t('mediaLibrary.empty') }}
      </p>
      <UButton
        v-if="canManage"
        icon="i-lucide-upload"
        :label="t('mediaLibrary.upload')"
        class="mt-4"
        @click="input?.click()"
      />
    </UCard>
    <div
      v-else
      class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2"
    >
      <MediaTile
        v-for="media in list.items.value"
        :key="media.id"
        :media="media"
        :selected="selecting && picked.includes(media.id)"
      >
        <button
          v-if="selecting"
          type="button"
          class="absolute inset-0 flex items-start justify-end p-1"
          :class="media.status === 'ready' ? 'cursor-pointer' : 'cursor-not-allowed bg-default/40'"
          :aria-pressed="picked.includes(media.id)"
          :aria-label="t('mediaLibrary.toIdeas.pick')"
          @click="togglePick(media)"
        >
          <span
            v-if="!picked.includes(media.id)"
            class="size-6 rounded-full border-2 border-default bg-default/80"
          />
        </button>
        <UDropdownMenu
          v-else-if="canManage"
          :items="actions(media)"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            size="xs"
            color="neutral"
            variant="solid"
            class="absolute top-1 right-1 rounded-full"
            :aria-label="t('common.more')"
          />
        </UDropdownMenu>
      </MediaTile>
    </div>
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
    <div
      v-if="selecting && picked.length"
      class="sticky bottom-20 lg:bottom-4 mt-4 flex items-center justify-between gap-3 rounded-md border border-default bg-elevated p-3 shadow-lg"
    >
      <span class="text-sm">{{ t('mediaLibrary.toIdeas.selected', { n: picked.length }) }}</span>
      <UButton
        icon="i-lucide-lightbulb"
        :label="t('mediaLibrary.toIdeas.confirm', { n: picked.length })"
        @click="ideaDialog = true"
      />
    </div>
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
  </div>
</template>
