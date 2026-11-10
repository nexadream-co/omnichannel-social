<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'

/**
 * A platform's logo on its brand colour, so a post is recognisable at a glance (Kalender chips, the drag card).
 * `faded`: the post was deleted on that platform. Badges in a row overlap; `ring` (the background they sit on) keeps them apart.
 */
const props = withDefaults(defineProps<{ platform: Platform, size?: 'xs' | 'sm' | 'md', faded?: boolean, ring?: string }>(), { size: 'sm', ring: 'ring-(--ui-bg)' })

// Black logos flip to white in dark mode, so Threads, TikTok and X stay visible on a dark page.
const SKIN: Record<Platform, string> = {
  instagram: 'bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285aeb_90%)] text-white',
  facebook: 'bg-[#1877F2] text-white',
  youtube: 'bg-[#FF0000] text-white',
  threads: 'bg-black text-white dark:bg-white dark:text-black',
  tiktok: 'bg-black text-white dark:bg-white dark:text-black',
  x: 'bg-black text-white dark:bg-white dark:text-black'
}
const SIZE = { xs: ['size-4', 'size-2.5'], sm: ['size-5', 'size-3'], md: ['size-6', 'size-3.5'] } as const
const name = computed(() => PLATFORM_META[props.platform].name)
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-full ring-2 shrink-0"
    :class="[SKIN[platform], SIZE[size][0], ring, faded ? 'opacity-40 grayscale' : '']"
    :title="name"
    role="img"
    :aria-label="name"
  >
    <UIcon
      :name="PLATFORM_META[platform].icon"
      :class="SIZE[size][1]"
    />
  </span>
</template>
