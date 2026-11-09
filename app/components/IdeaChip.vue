<script setup lang="ts">
import { PILLAR_META, type PlannerIdea } from '#shared/utils/planner'

/**
 * A planned idea on a Kalender day: dashed, so it never reads as a post that will go out.
 * `wrap`: two lines instead of one (the week view's narrow, tall columns).
 */
const props = defineProps<{ idea: PlannerIdea, wrap?: boolean }>()
const emit = defineEmits<{ open: [id: string] }>()
const { t } = useI18n()
const auth = useCreatorAuth()
const draggable = computed(() => auth.hasAbility('posts.write'))
const icon = computed(() => props.idea.pillar ? PILLAR_META[props.idea.pillar].icon : 'i-lucide-lightbulb')
const el = ref<HTMLElement | null>(null)
const { lifted } = useDragSource(el, {
  enabled: () => draggable.value,
  payload: () => ({ kind: 'idea', id: props.idea.id, from: props.idea.plannedOn }),
  preview: () => ({ kind: 'idea', title: props.idea.title, icon: icon.value })
})
</script>

<template>
  <button
    ref="el"
    type="button"
    class="w-full text-left text-xs rounded-md px-1.5 py-1 border border-dashed border-accented text-muted hover:text-default hover:bg-elevated/60 flex gap-1 min-w-0 select-none [-webkit-touch-callout:none] motion-safe:transition-[opacity,transform]"
    :class="[wrap ? 'items-start' : 'items-center', lifted ? 'opacity-30 scale-95' : '', draggable ? 'cursor-grab active:cursor-grabbing touch-pan-y' : '']"
    :title="t('planner.idea.chip')"
    @click="emit('open', idea.id)"
  >
    <UIcon
      :name="icon"
      class="size-3 shrink-0"
      :class="wrap ? 'mt-0.5' : ''"
    />
    <span :class="wrap ? 'line-clamp-2 break-words' : 'truncate'">{{ idea.title }}</span>
  </button>
</template>
