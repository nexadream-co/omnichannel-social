<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import type { DayPost } from '~/utils/calendar'

/** A post on a Kalender day. Scheduled posts drag to another day (the time of day is kept). `wrap`: two lines (week view). */
const props = defineProps<{ post: DayPost, wrap?: boolean }>()
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const planner = usePlanner()

const draggable = computed(() => auth.hasAbility('posts.write') && props.post.status === 'scheduled')
const platforms = computed(() => [...new Set(props.post.platforms)])
const removedLabel = (p: Platform) => t('posts.removedOn', { platform: PLATFORM_META[p].name })
</script>

<template>
  <NuxtLink
    :to="localePath(`/app/posts/${post.postId}`)"
    :draggable="draggable"
    class="text-xs rounded px-1.5 py-1 bg-elevated hover:bg-accented/50 flex gap-1 min-w-0"
    :class="wrap ? 'flex-wrap items-center' : 'items-center'"
    @dragstart="planner.drag.value = { kind: 'post', postId: post.postId, time: post.time }"
    @dragend="planner.drag.value = null"
  >
    <span
      class="size-1.5 rounded-full shrink-0"
      :class="postDot(post.status)"
    />
    <span class="text-muted shrink-0">{{ post.time }}</span>
    <UIcon
      v-for="p in platforms"
      :key="p"
      :name="PLATFORM_META[p].icon"
      class="size-3 shrink-0"
      :class="post.removed.includes(p) ? 'opacity-40' : ''"
      :title="post.removed.includes(p) ? removedLabel(p) : undefined"
    />
    <span
      :class="[wrap ? 'basis-full line-clamp-2 break-words' : 'truncate', allRemoved(post) ? 'line-through text-muted' : '']"
    >{{ post.caption || t('posts.noCaption') }}</span>
  </NuxtLink>
</template>
