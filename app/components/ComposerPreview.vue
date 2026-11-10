<script setup lang="ts">
import { CHANNELS, PLATFORM_META } from '#shared/channels/registry'
import { previewCaption } from '#shared/channels/preview'
import type { Platform, PostFormat } from '#shared/channels/types'
import type { UploadItem } from '~/components/MediaUploader.vue'

export interface PreviewEntry {
  platform: Platform
  username: string | null
  avatarUrl: string | null
  format: PostFormat
  caption: string
}

/** What followers will see: avatar and handle, the picture at the shape the platform shows, the caption cut where the feed cuts it. */
const props = defineProps<{ entries: PreviewEntry[], media: UploadItem[] }>()
const { t } = useI18n()

const active = ref<Platform | null>(null)
const platforms = computed(() => [...new Set(props.entries.map(e => e.platform))])
const current = computed(() => props.entries.find(e => e.platform === active.value) ?? props.entries[0] ?? null)
watch(platforms, (list) => {
  if (!active.value || !list.includes(active.value)) active.value = list[0] ?? null
}, { immediate: true })

const tabs = computed(() => platforms.value.map(value => ({ value, label: PLATFORM_META[value].name, icon: PLATFORM_META[value].icon, ui: { leadingIcon: brandIconClass(value) } })))
const caps = computed(() => current.value ? CHANNELS[current.value.platform] : null)
const cover = computed(() => props.media[0] ?? null)
const shown = computed(() => current.value && caps.value ? previewCaption(caps.value, current.value.caption) : { text: '', truncated: false })
const expanded = ref(false)
watch(() => current.value?.platform, () => {
  expanded.value = false
})

/** The shape the platform keeps: tall for stories and reels, otherwise the photo's own ratio held inside the platform's bounds. */
const ratio = computed(() => {
  if (!current.value || !cover.value) return 1
  if (current.value.format === 'story' || current.value.format === 'reel') return 9 / 16
  const bounds = caps.value?.media[current.value.format]?.image?.aspect
  const own = cover.value.width && cover.value.height ? cover.value.width / cover.value.height : 1
  const [min, max] = bounds ?? [0.5, 1.91]
  return Math.min(Math.max(own, min), max)
})
const textOnly = computed(() => current.value?.format === 'text' || !cover.value)
/** A carousel shows every item, swipeable like on the platform; other formats publish only the first one. */
const slides = computed(() => current.value?.format === 'carousel' ? props.media : props.media.slice(0, 1))
const slide = ref(0)
</script>

<template>
  <div
    v-if="current"
    class="space-y-3"
  >
    <UTabs
      v-if="tabs.length > 1"
      :model-value="active ?? undefined"
      :items="tabs"
      :content="false"
      size="sm"
      class="w-full"
      @update:model-value="(value: string | number) => active = value as Platform"
    />
    <div class="rounded-md border border-default overflow-hidden bg-default">
      <div class="flex items-center gap-2 px-3 py-2">
        <SmartImage
          :src="current.avatarUrl"
          :title="current.username ?? PLATFORM_META[current.platform].name"
          kind="avatar"
          class="size-8 rounded-full shrink-0"
        />
        <span class="text-sm font-semibold truncate">{{ current.username ? `@${current.username}` : PLATFORM_META[current.platform].name }}</span>
        <UBadge
          size="sm"
          color="neutral"
          variant="subtle"
          class="ml-auto"
          :label="t(`format.${current.format}`)"
        />
      </div>
      <div
        v-if="!textOnly"
        class="relative bg-elevated mx-auto max-h-[28rem]"
        :style="{ aspectRatio: String(ratio) }"
      >
        <!-- Swipe, drag, trackpad or arrow keys; the arrows only show where there is no touch-first screen. -->
        <UCarousel
          v-slot="{ item }"
          :items="slides"
          :arrows="slides.length > 1"
          :prev="{ size: 'xs', color: 'neutral', variant: 'solid' }"
          :next="{ size: 'xs', color: 'neutral', variant: 'solid' }"
          class="absolute inset-0"
          :ui="{
            root: 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
            viewport: 'h-full',
            container: 'h-full items-stretch ms-0',
            item: 'relative h-full ps-0',
            prev: 'start-2 sm:start-2 max-sm:hidden opacity-90 disabled:opacity-0',
            next: 'end-2 sm:end-2 max-sm:hidden opacity-90 disabled:opacity-0'
          }"
          @select="(index: number) => slide = index"
        >
          <!-- SmartImage's root is `relative` with size containment, so it gets its size from the slide. -->
          <SmartImage
            :src="item.previewUrl ?? item.posterUrl"
            kind="media"
            class="absolute inset-0"
          />
          <UIcon
            v-if="item.kind === 'video'"
            name="i-lucide-play"
            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-10 text-white drop-shadow pointer-events-none"
          />
        </UCarousel>
        <span
          v-if="slides.length > 1"
          class="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white tabular-nums pointer-events-none"
        >{{ slide + 1 }}/{{ slides.length }}</span>
      </div>
      <div
        v-if="!textOnly && slides.length > 1"
        class="flex flex-wrap justify-center gap-1 pt-2"
        aria-hidden="true"
      >
        <span
          v-for="(_, n) in slides"
          :key="n"
          class="size-1.5 rounded-full motion-safe:transition-colors"
          :class="n === slide ? 'bg-primary' : 'bg-accented'"
        />
      </div>
      <p class="px-3 py-2 text-sm whitespace-pre-line break-words">
        <template v-if="current.caption">
          {{ expanded ? current.caption : shown.text }}<template v-if="shown.truncated && !expanded">
            …
            <button
              type="button"
              class="text-muted hover:text-default"
              @click="expanded = true"
            >
              {{ t('composer.previewMore') }}
            </button>
          </template>
        </template>
        <span
          v-else
          class="text-muted"
        >{{ t('posts.noCaption') }}</span>
      </p>
    </div>
    <p
      v-if="current.platform === 'instagram' && /https?:\/\//.test(current.caption)"
      class="text-xs text-muted"
    >
      {{ t('channel.instagram.linkNotClickable') }}
    </p>
  </div>
</template>
