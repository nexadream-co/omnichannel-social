<script setup lang="ts">
import type { MediaView } from '#shared/media/types'

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
        v-if="canManage"
        icon="i-lucide-upload"
        :label="t('mediaLibrary.upload')"
        :loading="uploading > 0"
        @click="input?.click()"
      />
    </CommandBar>

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
      >
        <UDropdownMenu
          v-if="canManage"
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
