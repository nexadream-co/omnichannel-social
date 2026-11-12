<script setup lang="ts">
import type { IdeaDetail } from '#shared/utils/planner'

/** The archive of the Ide board: ideas put away, each with "Pulihkan" in its menu. */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ open: [idea: IdeaDetail] }>()
const { t } = useI18n()

const filters = computed(() => ({ view: 'archived' }))
const list = useServerList<IdeaDetail>('/api/app/planner/ideas', { filters, limit: 20 })
watch(open, (value) => {
  if (value) void list.refresh()
})
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="t('ideas.archiveTitle')"
    :description="t('ideas.archiveHint')"
  >
    <template #body>
      <div
        v-if="list.status.value === 'loading' && !list.items.value.length"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-16 w-full"
        />
      </div>
      <EmptyState
        v-else-if="list.status.value === 'error' && !list.items.value.length"
        icon="i-lucide-cloud-off"
        :title="t('ideas.loadError')"
        :action="{ label: t('common.retry'), onClick: list.refresh }"
        compact
      />
      <EmptyState
        v-else-if="!list.items.value.length"
        icon="i-lucide-archive"
        :title="t('ideas.archiveEmpty')"
        compact
      />
      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="idea in list.items.value"
          :key="idea.id"
        >
          <IdeaCard
            :idea="idea"
            @open="emit('open', $event)"
          />
        </li>
      </ul>
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
  </ResponsiveSheet>
</template>
