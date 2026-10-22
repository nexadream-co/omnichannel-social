<script setup lang="ts">
import type { MediaView } from '#shared/media/types'

/** One square in Galeri Media and its picker: photo or video poster, length, "Diedit" badge, processing state. */
defineProps<{ media: MediaView, selected?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <div
    class="relative aspect-square rounded-md overflow-hidden bg-elevated border-2"
    :class="selected ? 'border-primary' : 'border-transparent'"
  >
    <img
      v-if="media.kind === 'image' && media.url"
      :src="media.url"
      alt=""
      loading="lazy"
      class="size-full object-cover"
    >
    <img
      v-else-if="media.posterUrl"
      :src="media.posterUrl"
      alt=""
      loading="lazy"
      class="size-full object-cover"
    >
    <div
      v-else
      class="size-full flex items-center justify-center"
    >
      <UIcon
        :name="media.kind === 'video' ? 'i-lucide-video' : 'i-lucide-image'"
        class="size-8 text-muted"
      />
    </div>
    <span
      v-if="media.kind === 'video' && media.durationMs"
      class="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/60 px-1 text-[11px] text-white tabular-nums"
    >
      <UIcon
        name="i-lucide-play"
        class="size-3"
      />
      {{ formatDuration(media.durationMs) }}
    </span>
    <UBadge
      v-if="media.sourceMediaId"
      :label="t('mediaLibrary.edited')"
      size="sm"
      color="neutral"
      variant="solid"
      class="absolute bottom-1 right-1"
    />
    <div
      v-if="media.status === 'processing'"
      class="absolute inset-0 bg-default/70 flex flex-col items-center justify-center gap-1 text-xs text-default"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin"
      />
      {{ t('composer.processing') }}
    </div>
    <span
      v-if="selected"
      class="absolute top-1 right-1 size-6 rounded-full bg-primary text-inverted flex items-center justify-center"
    >
      <UIcon
        name="i-lucide-check"
        class="size-4"
      />
    </span>
    <slot />
  </div>
</template>
