<script setup lang="ts">
import { onLongPress } from '@vueuse/core'
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { haptic } from '~/utils/haptics'
import type { DayPost } from '~/utils/calendar'

/** A post row in the phone agenda. Long-press (or the ⋯ button) opens "Pindahkan ke…" for scheduled posts. */
const props = defineProps<{ post: DayPost }>()
const emit = defineEmits<{ move: [post: DayPost] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()

const movable = computed(() => auth.hasAbility('posts.write') && props.post.status === 'scheduled')
const row = ref<HTMLElement | null>(null)
// A long press ends in a click on the link; swallow that one so the sheet does not open on top of a page change.
let pressed = false
onLongPress(row, () => {
  if (!movable.value) return
  pressed = true
  haptic('tick')
  emit('move', props.post)
}, { delay: 300, distanceThreshold: 10 })
function guard(event: MouseEvent) {
  if (!pressed) return
  pressed = false
  event.preventDefault()
}

const removedLabel = (p: Platform) => t('posts.removedOn', { platform: PLATFORM_META[p].name })
</script>

<template>
  <div class="flex items-center gap-1 rounded-md border border-default bg-default">
    <NuxtLink
      ref="row"
      :to="localePath(`/app/posts/${post.postId}`)"
      class="flex flex-1 min-w-0 items-center gap-3 p-3 select-none [-webkit-touch-callout:none]"
      @click.capture="guard"
      @contextmenu="movable && $event.preventDefault()"
    >
      <span
        class="size-2 rounded-full shrink-0"
        :class="post.overdue ? 'bg-warning' : postDot(post.status)"
      />
      <span class="text-sm text-muted w-12 shrink-0">{{ post.time }}</span>
      <span class="flex gap-1 shrink-0">
        <UIcon
          v-for="p in [...new Set(post.platforms)]"
          :key="p"
          :name="PLATFORM_META[p].icon"
          class="size-4"
          :class="post.removed.includes(p) ? 'opacity-40' : ''"
        />
      </span>
      <span
        class="text-sm truncate flex-1"
        :class="allRemoved(post) ? 'line-through text-muted' : ''"
      >{{ post.caption || t('posts.noCaption') }}</span>
      <UBadge
        v-if="post.overdue"
        color="warning"
        variant="subtle"
        size="sm"
        :label="t('calendar.overdue')"
        class="shrink-0"
      />
      <UBadge
        v-for="p in [...new Set(post.removed)]"
        :key="p"
        color="neutral"
        variant="subtle"
        size="sm"
        :label="removedLabel(p)"
        class="shrink-0"
      />
    </NuxtLink>
    <UDropdownMenu
      v-if="movable"
      :items="[[{ label: t('calendar.moveAction'), icon: 'i-lucide-calendar-clock', onSelect: () => emit('move', post) }]]"
      :content="{ align: 'end' }"
    >
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        class="mr-1"
        :aria-label="t('calendar.moveAction')"
      />
    </UDropdownMenu>
  </div>
</template>
