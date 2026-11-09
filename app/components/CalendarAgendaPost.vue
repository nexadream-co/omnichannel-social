<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { postEdge, type DayPost } from '~/utils/calendar'

/**
 * A post row in the phone agenda: picture with a brand badge per platform, time, caption and account. A scheduled
 * post lifts on a touch hold and drags to another day; a hold released in place (or the ⋯ button) opens "Pindahkan ke…".
 */
const props = defineProps<{ post: DayPost }>()
const emit = defineEmits<{ move: [post: DayPost] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()

const movable = computed(() => auth.hasAbility('posts.write') && props.post.status === 'scheduled')
const platforms = computed(() => [...new Set(props.post.platforms)])
const row = ref<HTMLElement | null>(null)
const { lifted } = useDragSource(row, {
  enabled: () => movable.value,
  payload: () => ({ kind: 'post', postId: props.post.postId, time: props.post.time, scheduledAt: props.post.scheduledAt }),
  preview: () => ({ kind: 'post', title: props.post.caption || t('posts.noCaption'), time: props.post.time, platforms: platforms.value, thumb: props.post.thumb, video: props.post.video }),
  onHold: () => emit('move', props.post)
})

const removedLabel = (p: Platform) => t('posts.removedOn', { platform: PLATFORM_META[p].name })
const accounts = computed(() => (props.post.accounts ?? []).map(a => `@${a}`).join(' · '))
</script>

<template>
  <div
    class="flex items-center gap-1 rounded-md border border-default border-l-[3px] bg-default motion-safe:transition-[opacity,transform]"
    :class="[postEdge(post), lifted ? 'opacity-30 scale-95' : '']"
  >
    <NuxtLink
      ref="row"
      :to="localePath(`/app/posts/${post.postId}`)"
      draggable="false"
      class="flex flex-1 min-w-0 items-center gap-3 p-2.5 select-none [-webkit-touch-callout:none]"
    >
      <div class="relative shrink-0">
        <SmartImage
          :src="post.thumb"
          kind="post"
          class="size-12 rounded-md"
        />
        <UIcon
          v-if="post.video"
          name="i-lucide-play"
          class="absolute inset-0 m-auto size-4 text-white drop-shadow"
        />
        <span class="absolute -bottom-1.5 -right-1.5 flex -space-x-1.5">
          <PlatformBadge
            v-for="p in platforms"
            :key="p"
            :platform="p"
            size="sm"
            :faded="post.removed.includes(p)"
          />
        </span>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-highlighted tabular-nums">{{ post.time }}</span>
          <UBadge
            v-if="post.overdue"
            color="warning"
            variant="subtle"
            size="sm"
            :label="t('calendar.overdue')"
          />
          <UBadge
            v-for="p in [...new Set(post.removed)]"
            :key="p"
            color="neutral"
            variant="subtle"
            size="sm"
            :label="removedLabel(p)"
          />
        </div>
        <p
          class="text-sm truncate"
          :class="allRemoved(post) ? 'line-through text-muted' : 'text-default'"
        >
          {{ post.caption || t('posts.noCaption') }}
        </p>
        <p
          v-if="accounts"
          class="text-xs text-muted truncate"
        >
          {{ accounts }}
        </p>
      </div>
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
