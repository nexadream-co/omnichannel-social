<script setup lang="ts">
import type { MediaView } from '#shared/media/types'

/** Pick ready photos/videos from Galeri Media for a post (composer). */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ max: number }>()
const emit = defineEmits<{ pick: [media: MediaView[]] }>()
const { t } = useI18n()

const kind = ref<'all' | 'image' | 'video'>('all')
const filters = computed(() => ({ ready: 'true', ...(kind.value === 'all' ? {} : { kind: kind.value }) }))
const list = useServerList<MediaView>('/api/app/media', { filters, limit: 24 })
const picked = ref<MediaView[]>([])

watch(open, (value) => {
  if (!value) return
  picked.value = []
  list.refresh()
}, { immediate: true })

function toggle(media: MediaView) {
  if (picked.value.some(m => m.id === media.id)) picked.value = picked.value.filter(m => m.id !== media.id)
  else if (picked.value.length < props.max) picked.value = [...picked.value, media]
}

function confirm() {
  emit('pick', picked.value)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('mediaLibrary.pickTitle')"
    :description="t('mediaLibrary.pickHint', { max })"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UTabs
        v-model="kind"
        :items="[{ value: 'all', label: t('mediaLibrary.kind.all') }, { value: 'image', label: t('mediaLibrary.kind.image') }, { value: 'video', label: t('mediaLibrary.kind.video') }]"
        :content="false"
        size="sm"
        class="mb-3"
      />
      <div
        v-if="list.status.value === 'loading' && !list.items.value.length"
        class="grid grid-cols-3 sm:grid-cols-4 gap-2"
      >
        <USkeleton
          v-for="n in 8"
          :key="n"
          class="aspect-square"
        />
      </div>
      <p
        v-else-if="!list.items.value.length"
        class="text-sm text-muted text-center py-8"
      >
        {{ t('mediaLibrary.empty') }}
      </p>
      <div
        v-else
        class="grid grid-cols-3 sm:grid-cols-4 gap-2"
      >
        <button
          v-for="media in list.items.value"
          :key="media.id"
          type="button"
          @click="toggle(media)"
        >
          <MediaTile
            :media="media"
            :selected="picked.some(m => m.id === media.id)"
          />
        </button>
      </div>
      <div
        v-if="list.pageCount.value > 1"
        class="flex justify-center mt-3"
      >
        <UPagination
          v-model:page="list.page.value"
          :total="list.total.value"
          :items-per-page="list.limit.value"
          size="sm"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('common.cancel')"
          @click="open = false"
        />
        <UButton
          :label="t('mediaLibrary.add', { n: picked.length })"
          :disabled="!picked.length"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
