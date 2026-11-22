<script setup lang="ts">
import { IDEA_STAGES, moveBlocked, moveCheck, type IdeaDetail, type IdeaStage } from '#shared/utils/planner'
import { STAGE_STYLE } from '~/utils/ideaBoard'

/**
 * "Pindahkan ke…": the stages as a list, for phones and keyboards. Each one says plainly what the move means for the
 * idea (the same honesty the confirmation gives), and the card lands at the top of the column.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ idea: IdeaDetail | null }>()
const emit = defineEmits<{ pick: [stage: IdeaStage] }>()
const { t } = useI18n()

const rows = computed(() => IDEA_STAGES.map((stage) => {
  const idea = props.idea
  const reason = idea && stage !== idea.stage ? moveCheck(idea.actualStage, stage) : null
  const blocked = Boolean(idea && stage !== idea.stage && moveBlocked(idea.actualStage, stage))
  return { stage, here: idea?.stage === stage, reason, blocked }
}))

function pick(stage: IdeaStage) {
  emit('pick', stage)
  open.value = false
}
</script>

<template>
  <ResponsiveSheet
    v-model:open="open"
    :title="t('ideas.move.title')"
    :description="idea?.title"
  >
    <template #body>
      <ul class="space-y-1.5">
        <li
          v-for="row in rows"
          :key="row.stage"
        >
          <button
            type="button"
            class="w-full min-h-12 flex items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            :class="row.blocked ? 'bg-elevated/40' : row.reason ? 'bg-warning/10' : 'bg-elevated/70 hover:bg-elevated'"
            :disabled="row.here || row.blocked"
            @click="pick(row.stage)"
          >
            <span
              class="size-2.5 rounded-full shrink-0"
              :class="STAGE_STYLE[row.stage].dot"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-highlighted">{{ t(`ideas.stage.${row.stage}`) }}</span>
              <span
                v-if="row.here"
                class="block text-xs text-muted"
              >{{ t('ideas.move.here') }}</span>
              <span
                v-else-if="row.blocked"
                class="block text-xs text-muted"
              >{{ t(`ideas.blocked.${row.reason}.short`) }}</span>
              <span
                v-else-if="row.reason"
                class="block text-xs text-warning"
              >{{ t(`ideas.note.${row.reason}`) }}</span>
              <span
                v-else
                class="block text-xs text-muted"
              >{{ t(`ideas.hint.${row.stage}`) }}</span>
            </span>
            <UIcon
              v-if="row.blocked"
              name="i-lucide-lock"
              class="size-4 text-muted shrink-0"
            />
            <UIcon
              v-else-if="row.reason"
              name="i-lucide-triangle-alert"
              class="size-4 text-warning shrink-0"
            />
          </button>
        </li>
      </ul>
    </template>
  </ResponsiveSheet>
</template>
