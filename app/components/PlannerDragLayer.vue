<script setup lang="ts">
/**
 * The card that follows the pointer while a post or idea is dragged on the Kalender (see useDragSource), with a
 * pill that names the day it will land on, or says why it cannot. Position comes from the --drag-x / --drag-y
 * custom properties, so moving the pointer never re-renders Vue. On touch the card floats above the finger, kept
 * inside the screen (it is w-56 = 14rem wide).
 */
const { t } = useI18n()
const planner = usePlanner()
const { preview, over } = usePlannerDragState()

const past = computed(() => over.value !== null && planner.isPastDrop(over.value))
const label = computed(() => {
  if (!over.value || !preview.value) return null
  if (past.value) return t('calendar.dropPast')
  const day = planner.dayLabel(over.value)
  return preview.value.time ? `${day} · ${preview.value.time}` : day
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="preview"
      class="fixed left-0 top-0 z-[100] pointer-events-none"
      :style="{ transform: preview.touch ? 'translate(clamp(8px, calc(var(--drag-x) - 7rem), calc(100vw - 14rem - 8px)), calc(var(--drag-y) - 100% - 28px))' : 'translate(calc(var(--drag-x) - 20px), calc(var(--drag-y) - 18px))' }"
      aria-hidden="true"
    >
      <div
        class="w-56 rounded-lg bg-default shadow-xl ring-1 ring-default p-2 flex gap-2 rotate-2 motion-safe:animate-drag-lift"
        :class="preview.kind === 'idea' ? 'border border-dashed border-accented' : ''"
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
