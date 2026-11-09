<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { postEdge, type DayPost } from '~/utils/calendar'

/**
 * A post on a Kalender day: its picture, a brand badge per platform, the time and the caption, with a status-coloured
 * left edge. Scheduled posts drag to another day (mouse, pen or touch hold; the time of day is kept).
 * `wrap`: the week view's taller card; otherwise one line (month view).
 */
const props = defineProps<{ post: DayPost, wrap?: boolean }>()
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()

const el = ref<HTMLElement | null>(null)
const draggable = computed(() => auth.hasAbility('posts.write') && props.post.status === 'scheduled')
const platforms = computed(() => [...new Set(props.post.platforms)])
const { lifted } = useDragSource(el, {
  enabled: () => draggable.value,
  payload: () => ({ kind: 'post', postId: props.post.postId, time: props.post.time, scheduledAt: props.post.scheduledAt }),
  preview: () => ({ kind: 'post', title: props.post.caption || t('posts.noCaption'), time: props.post.time, platforms: platforms.value, thumb: props.post.thumb, video: props.post.video })
})

// Screen readers hear the time, the platforms (and where the post was deleted) and the caption.
const platformNames = (list: Platform[]) => list.map(p => props.post.removed.includes(p) ? t('posts.removedOn', { platform: PLATFORM_META[p].name }) : PLATFORM_META[p].name).join(', ')
const label = computed(() => [props.post.time, platformNames(platforms.value), props.post.caption || t('posts.noCaption')].join(' · '))
</script>

<template>
  <NuxtLink
    ref="el"
    :to="localePath(`/app/posts/${post.postId}`)"
    draggable="false"
    :aria-label="label"
    class="group/chip text-xs rounded-md border-l-[3px] bg-elevated hover:bg-accented/60 min-w-0 select-none [-webkit-touch-callout:none] motion-safe:transition-[opacity,transform]"
    :class="[postEdge(post), wrap ? 'p-1.5 flex flex-col gap-1' : 'px-1.5 py-1 flex items-center gap-1.5', lifted ? 'opacity-30 scale-95' : '', draggable ? 'cursor-grab active:cursor-grabbing touch-pan-y' : '']"
  >
    <template v-if="wrap">
      <div class="flex items-center gap-1.5 min-w-0">
        <div class="relative shrink-0">
          <SmartImage
            :src="post.thumb"
            kind="post"
            class="size-8 rounded"
            :class="post.thumb ? '' : 'opacity-60'"
          />
          <UIcon
            v-if="post.video"
            name="i-lucide-play"
            class="absolute inset-0 m-auto size-3 text-white drop-shadow"
          />
        </div>
        <div class="min-w-0 flex-1">
          <span class="flex -space-x-1.5">
            <PlatformBadge
              v-for="p in platforms"
              :key="p"
              :platform="p"
              size="sm"
              ring="ring-(--ui-bg-elevated)"
              :faded="post.removed.includes(p)"
            />
          </span>
          <span class="block text-muted tabular-nums mt-0.5">{{ post.time }}</span>
        </div>
        <UIcon
          v-if="draggable"
          name="i-lucide-grip-vertical"
          class="size-3.5 text-dimmed shrink-0 opacity-0 group-hover/chip:opacity-100 motion-safe:transition-opacity"
        />
      </div>
      <span
        v-if="post.overdue"
        class="text-warning font-medium"
      >{{ t('calendar.overdue') }}</span>
      <span
        class="line-clamp-2 break-words text-default"
        :class="allRemoved(post) ? 'line-through text-muted' : ''"
      >{{ post.caption || t('posts.noCaption') }}</span>
    </template>
    <template v-else>
      <span class="flex -space-x-1 shrink-0">
        <PlatformBadge
          v-for="p in platforms"
          :key="p"
          :platform="p"
          size="xs"
          ring="ring-(--ui-bg-elevated)"
          :faded="post.removed.includes(p)"
        />
      </span>
      <span class="text-muted shrink-0 tabular-nums">{{ post.time }}</span>
      <span
        class="truncate"
        :class="allRemoved(post) ? 'line-through text-muted' : ''"
      >{{ post.caption || t('posts.noCaption') }}</span>
    </template>
  </NuxtLink>
</template>
