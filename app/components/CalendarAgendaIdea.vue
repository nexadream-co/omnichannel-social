<script setup lang="ts">
import { PILLAR_META, type PlannerIdea } from '#shared/utils/planner'

/** A planned idea in the phone agenda (dashed: not a post). A touch hold lifts it to drag onto another day. */
const props = defineProps<{ idea: PlannerIdea }>()
const emit = defineEmits<{ open: [id: string] }>()
const { t } = useI18n()
const auth = useCreatorAuth()

const icon = computed(() => props.idea.pillar ? PILLAR_META[props.idea.pillar].icon : 'i-lucide-lightbulb')
const el = ref<HTMLElement | null>(null)
const { lifted } = useDragSource(el, {
  enabled: () => auth.hasAbility('posts.write'),
  payload: () => ({ kind: 'idea', id: props.idea.id, from: props.idea.plannedOn }),
  preview: () => ({ kind: 'idea', title: props.idea.title, icon: icon.value })
})
</script>

<template>
  <button
    ref="el"
    type="button"
    class="w-full text-left flex items-center gap-3 rounded-md border border-dashed border-accented p-3 select-none [-webkit-touch-callout:none] motion-safe:transition-[opacity,transform]"
    :class="lifted ? 'opacity-30 scale-95' : ''"
    @click="emit('open', idea.id)"
  >
    <UIcon
      :name="icon"
      class="size-4 text-muted shrink-0"
    />
    <span class="text-sm truncate flex-1">{{ idea.title }}</span>
    <span class="text-xs text-muted shrink-0">{{ t('planner.idea.chip') }}</span>
  </button>
</template>
