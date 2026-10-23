<script setup lang="ts">
import { PILLAR_META, type PlannerIdea } from '#shared/utils/planner'

/**
 * A planned idea on a Kalender day: dashed, so it never reads as a post that will go out.
 * `wrap`: two lines instead of one (the week view's narrow, tall columns).
 */
defineProps<{ idea: PlannerIdea, wrap?: boolean }>()
const emit = defineEmits<{ open: [id: string] }>()
const { t } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()
const draggable = computed(() => auth.hasAbility('posts.write'))
</script>

<template>
  <button
    type="button"
    :draggable="draggable"
    class="w-full text-left text-xs rounded px-1.5 py-1 border border-dashed border-accented text-muted hover:text-default hover:bg-elevated/60 flex gap-1 min-w-0"
    :class="wrap ? 'items-start' : 'items-center'"
    :title="t('planner.idea.chip')"
    @click="emit('open', idea.id)"
    @dragstart="planner.drag.value = { kind: 'idea', id: idea.id }"
    @dragend="planner.drag.value = null"
  >
    <UIcon
      :name="idea.pillar ? PILLAR_META[idea.pillar].icon : 'i-lucide-lightbulb'"
      class="size-3 shrink-0"
      :class="wrap ? 'mt-0.5' : ''"
    />
    <span :class="wrap ? 'line-clamp-2 break-words' : 'truncate'">{{ idea.title }}</span>
  </button>
</template>
