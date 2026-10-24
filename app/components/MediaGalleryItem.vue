<script setup lang="ts">
import { onLongPress } from '@vueuse/core'
import type { MediaView } from '#shared/media/types'

/**
 * One tile in Galeri Media with its controls. Phone: tap opens the actions sheet, a 300 ms press starts selecting.
 * Desktop: a checkbox and a "⋮" menu appear on hover or keyboard focus.
 */
const props = defineProps<{ media: MediaView, selecting: boolean, picked: boolean, canManage: boolean, desktop: boolean }>()
const emit = defineEmits<{ toggle: [], open: [], edit: [], use: [], remove: [] }>()
const { t } = useI18n()

const el = useTemplateRef<HTMLElement>('el')
let pressed = false
onLongPress(el, () => {
  if (props.desktop || props.media.status !== 'ready') return
  pressed = true
  haptic('tick')
  emit('toggle')
  setTimeout(() => {
    pressed = false
  }, 450)
}, { delay: 300, modifiers: { prevent: true } })

function onTap() {
  if (pressed) return
  if (props.selecting) return props.media.status === 'ready' ? emit('toggle') : undefined
  if (!props.desktop && props.canManage) emit('open')
}

const ready = computed(() => props.media.status === 'ready')
const items = computed(() => [
  [
    { label: t('mediaEditor.open'), icon: 'i-lucide-wand-sparkles', disabled: !ready.value, onSelect: () => emit('edit') },
    { label: t('mediaLibrary.usePost'), icon: 'i-lucide-square-pen', disabled: !ready.value, onSelect: () => emit('use') }
  ],
  [{ label: t('common.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('remove') }]
])
</script>

<template>
  <div
    ref="el"
    class="group relative select-none [-webkit-touch-callout:none]"
    @click="onTap"
    @contextmenu.prevent
  >
    <MediaTile
      :media="media"
      :selected="picked"
    />
    <button
      v-if="canManage && ready && (desktop || selecting)"
      type="button"
      class="absolute top-1 left-1 size-6 rounded-full border-2 grid place-items-center transition-opacity focus-visible:opacity-100"
      :class="[picked ? 'bg-primary border-primary text-inverted opacity-100' : 'border-default bg-default/80 text-transparent', selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100']"
      :aria-pressed="picked"
      :aria-label="t('mediaLibrary.toIdeas.pick')"
      @click.stop="emit('toggle')"
    >
      <UIcon
        name="i-lucide-check"
        class="size-4"
      />
    </button>
    <UDropdownMenu
      v-if="canManage && desktop && !selecting"
      :items="items"
      :content="{ align: 'end' }"
    >
      <UButton
        icon="i-lucide-ellipsis-vertical"
        size="xs"
        color="neutral"
        variant="solid"
        class="absolute top-1 right-1 rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity"
        :aria-label="t('common.more')"
        @click.stop
      />
    </UDropdownMenu>
  </div>
</template>
