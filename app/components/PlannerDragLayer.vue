<script setup lang="ts">
import { moveCheck, type IdeaStage } from '#shared/utils/planner'

/**
 * The card that follows the pointer while a post or idea is dragged on the Kalender, or a card on the Ide board (see
 * useDragSource), with a pill that names where it will land, or says why it cannot. Position, tilt and scale come
 * from the --drag-* custom properties, so moving the pointer never re-renders Vue. A board card floats at its own
 * size, hanging from the point it was grabbed; a post or idea on touch floats above the finger, kept inside the
 * screen (it is w-56 = 14rem wide).
 */
const { t } = useI18n()
const planner = usePlanner()
const { preview, over } = usePlannerDragState()

const stageOver = computed(() => over.value?.startsWith('stage:') ? over.value.slice(6) as IdeaStage : null)
const confirmNeeded = computed(() => {
  const item = planner.drag.value
  return item?.kind === 'card' && stageOver.value !== null && stageOver.value !== item.from && moveCheck(item.actual, stageOver.value) !== null
})

const past = computed(() => over.value !== null && !stageOver.value && planner.isPastDrop(over.value))
const label = computed(() => {
  if (!over.value || !preview.value || stageOver.value) return null
  if (past.value) return t('calendar.dropPast')
  const day = planner.dayLabel(over.value)
  return preview.value.time ? `${day} · ${preview.value.time}` : day
})
</script>

<template>
  <Teleport to="body">
    <template v-if="preview?.kind === 'card' && preview.idea">
      <div
        class="fixed left-0 top-0 z-[100] pointer-events-none"
        :style="{ width: `${preview.size?.w ?? 260}px`, transform: 'translate(calc(var(--drag-x) - var(--drag-ox)), calc(var(--drag-y) - var(--drag-oy)))' }"
        aria-hidden="true"
      >
        <div :style="{ transformOrigin: 'var(--drag-ox) var(--drag-oy)', transform: 'rotate(var(--drag-tilt)) scale(var(--drag-scale))' }">
          <div class="rounded-lg shadow-2xl motion-safe:animate-drag-lift">
            <IdeaBoardCard
              :idea="preview.idea"
              floating
            />
          </div>
        </div>
      </div>
      <div
        v-if="stageOver"
        class="fixed left-0 top-0 z-[101] pointer-events-none inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-md"
        :class="confirmNeeded ? 'bg-warning text-inverted' : 'bg-primary text-inverted'"
        :style="{ transform: `translate(calc(var(--drag-x) + 14px), calc(var(--drag-y) + ${preview.touch ? '-56px' : '16px'}))` }"
        aria-hidden="true"
      >
        <UIcon
          :name="confirmNeeded ? 'i-lucide-triangle-alert' : 'i-lucide-check'"
          class="size-3.5"
        />
        {{ confirmNeeded ? t('ideas.needsConfirm') : t(`ideas.stage.${stageOver}`) }}
      </div>
    </template>
    <div
      v-else-if="preview"
      class="fixed left-0 top-0 z-[100] pointer-events-none"
      :style="{ transform: preview.touch ? 'translate(clamp(8px, calc(var(--drag-x) - 7rem), calc(100vw - 14rem - 8px)), calc(var(--drag-y) - 100% - 28px))' : 'translate(calc(var(--drag-x) - 20px), calc(var(--drag-y) - 18px))' }"
      aria-hidden="true"
    >
      <div
        class="w-56 rounded-lg bg-default shadow-xl ring-1 ring-default p-2 flex gap-2 motion-safe:animate-drag-lift"
        :class="preview.kind === 'idea' ? 'border border-dashed border-accented' : ''"
        :style="{ transformOrigin: preview.touch ? '7rem calc(100% + 28px)' : '20px 18px', transform: 'rotate(var(--drag-tilt, 0deg)) scale(var(--drag-scale, 1))' }"
      >
        <div
          v-if="preview.kind === 'post'"
          class="relative shrink-0"
        >
          <SmartImage
            :src="preview.thumb"
            kind="post"
            class="size-11 rounded-md"
          />
          <UIcon
            v-if="preview.video"
            name="i-lucide-play"
            class="absolute inset-0 m-auto size-4 text-white drop-shadow"
          />
        </div>
        <span
          v-else
          class="size-11 rounded-md bg-elevated flex items-center justify-center shrink-0"
        >
          <UIcon
            :name="preview.icon ?? 'i-lucide-lightbulb'"
            class="size-5 text-muted"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div
            v-if="preview.platforms?.length || preview.time"
            class="flex items-center gap-1.5 mb-0.5"
          >
            <span class="flex -space-x-1">
              <PlatformBadge
                v-for="p in preview.platforms ?? []"
                :key="p"
                :platform="p"
                size="xs"
              />
            </span>
            <span
              v-if="preview.time"
              class="text-xs text-muted"
            >{{ preview.time }}</span>
          </div>
          <p class="text-xs text-highlighted line-clamp-2 break-words">
            {{ preview.title }}
          </p>
        </div>
      </div>
      <div
        v-if="label"
        class="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-md"
        :class="past ? 'bg-error text-inverted' : 'bg-primary text-inverted'"
      >
        <UIcon
          :name="past ? 'i-lucide-ban' : 'i-lucide-calendar-check'"
          class="size-3.5"
        />
        {{ label }}
      </div>
    </div>
  </Teleport>
</template>
