<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { PILLAR_META, type IdeaDetail } from '#shared/utils/planner'

/** One idea in Bank Ide. Draggable onto a Kalender day (desktop) when it is still open. */
const props = defineProps<{ idea: IdeaDetail }>()
const emit = defineEmits<{ open: [idea: IdeaDetail] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const planner = usePlanner()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const draggable = computed(() => canWrite.value && props.idea.status === 'open')
const thumb = computed(() => {
  const first = props.idea.media[0]
  return first ? (first.kind === 'image' ? first.url : first.posterUrl) : null
})

const menu = computed<DropdownMenuItem[][]>(() => {
  const idea = props.idea
  if (idea.status === 'used') return [[{ label: t('planner.idea.openPost'), icon: 'i-lucide-external-link', to: localePath(`/app/posts/${idea.postId}`) }]]
  if (idea.status === 'archived') return [[{ label: t('planner.idea.restore'), icon: 'i-lucide-archive-restore', onSelect: () => planner.restoreIdea(idea.id) }]]
  return [
    [
      { label: t('planner.idea.toPost'), icon: 'i-lucide-square-pen', onSelect: () => planner.toPost(idea.id) },
      { label: t('planner.idea.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('open', idea) },
      ...(idea.plannedOn ? [{ label: t('planner.idea.removeDate'), icon: 'i-lucide-calendar-x', onSelect: () => planner.planIdea(idea.id, null) }] : [])
    ],
    [{ label: t('planner.idea.archive'), icon: 'i-lucide-archive', onSelect: () => planner.archiveIdea(idea.id) }]
  ]
})
</script>

<template>
  <div
    class="group rounded-md border border-dashed border-accented bg-default p-2.5 flex gap-2.5"
    :class="draggable ? 'cursor-grab active:cursor-grabbing' : ''"
    :draggable="draggable"
    @dragstart="planner.drag.value = { kind: 'idea', id: idea.id }"
    @dragend="planner.drag.value = null"
  >
    <img
      v-if="thumb"
      :src="thumb"
      alt=""
      class="size-12 rounded object-cover shrink-0"
    >
    <button
      type="button"
      class="flex-1 min-w-0 text-left"
      @click="emit('open', idea)"
    >
      <p class="text-sm text-highlighted line-clamp-2 break-words">
        {{ idea.title }}
      </p>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted">
        <span
          v-if="idea.pillar"
          class="flex items-center gap-1"
        >
          <UIcon
            :name="PILLAR_META[idea.pillar].icon"
            class="size-3.5"
          />
          {{ t(PILLAR_META[idea.pillar].labelKey) }}
        </span>
        <span
          v-if="idea.plannedOn"
          class="flex items-center gap-1"
        >
          <UIcon
            name="i-lucide-calendar"
            class="size-3.5"
          />
          {{ planner.dayLabel(idea.plannedOn) }}
        </span>
        <span
          v-if="idea.links.length"
          class="flex items-center gap-1"
        >
          <UIcon
            name="i-lucide-shopping-bag"
            class="size-3.5"
          />
          {{ t('planner.idea.productCount', { n: idea.links.length }) }}
        </span>
      </div>
    </button>
    <UDropdownMenu
      v-if="canWrite || idea.status === 'used'"
      :items="menu"
      :content="{ align: 'end' }"
    >
      <UButton
        icon="i-lucide-ellipsis-vertical"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="t('planner.idea.actions')"
      />
    </UDropdownMenu>
  </div>
</template>
