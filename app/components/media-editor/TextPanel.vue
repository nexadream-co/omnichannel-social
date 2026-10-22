<script setup lang="ts">
import { TEXT_FONTS, TEXT_STYLES, type Layer } from '#shared/media/edit-spec'
import { TEXT_COLORS, TEXT_FONT_META } from '#shared/media/presets'

type TextLayer = Extract<Layer, { type: 'text' }>

const props = defineProps<{ layer: TextLayer | null }>()
const emit = defineEmits<{ add: [], update: [layer: TextLayer] }>()
const { t } = useI18n()

const draft = ref(props.layer?.text ?? '')
watch(() => props.layer?.id, () => {
  draft.value = props.layer?.text ?? ''
})

function patch(values: Partial<TextLayer>) {
  if (props.layer) emit('update', { ...props.layer, ...values })
}

function onText(value: string) {
  draft.value = value
  if (value.trim()) patch({ text: value.slice(0, 300) })
}
</script>

<template>
  <div
    v-if="!layer"
    class="flex flex-col items-start gap-2"
  >
    <UButton
      icon="i-lucide-type"
      :label="t('mediaEditor.text.add')"
      @click="emit('add')"
    />
    <p class="text-xs text-muted">
      {{ t('mediaEditor.text.hint') }}
    </p>
  </div>
  <div
    v-else
    class="space-y-3"
  >
    <div class="flex gap-2">
      <UTextarea
        id="media-editor-text"
        :model-value="draft"
        :rows="1"
        autoresize
        :maxrows="3"
        class="flex-1"
        :placeholder="t('mediaEditor.text.placeholder')"
        @update:model-value="onText(String($event))"
      />
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="soft"
        :aria-label="t('mediaEditor.text.addAnother')"
        @click="emit('add')"
      />
    </div>
    <div class="flex gap-2 overflow-x-auto pb-1">
      <UButton
        v-for="font in TEXT_FONTS"
        :key="font"
        size="sm"
        :color="layer.font === font ? 'primary' : 'neutral'"
        :variant="layer.font === font ? 'solid' : 'outline'"
        class="shrink-0"
        :style="{ fontFamily: `'${TEXT_FONT_META[font].family}'`, fontWeight: TEXT_FONT_META[font].weight }"
        :label="t(TEXT_FONT_META[font].labelKey)"
        @click="patch({ font })"
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-for="style in TEXT_STYLES"
        :key="style"
        size="sm"
        :color="layer.style === style ? 'primary' : 'neutral'"
        :variant="layer.style === style ? 'solid' : 'soft'"
        :label="t(`mediaEditor.text.style.${style}`)"
        @click="patch({ style })"
      />
      <span class="w-px h-6 bg-border mx-1" />
      <button
        v-for="color in TEXT_COLORS"
        :key="color"
        type="button"
        class="size-7 rounded-full border-2 ring-offset-2 ring-offset-default"
        :class="layer.color === color ? 'ring-2 ring-primary border-default' : 'border-default'"
        :style="{ backgroundColor: color }"
        :aria-label="color"
        @click="patch({ color })"
      />
    </div>
  </div>
</template>
