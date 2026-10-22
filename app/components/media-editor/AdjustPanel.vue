<script setup lang="ts">
import { cssFilter } from '#shared/media/adjust'
import type { Adjust, EditSpec } from '#shared/media/edit-spec'
import { FILTER_PRESETS } from '#shared/media/presets'

const spec = defineModel<EditSpec>('spec', { required: true })
defineProps<{ mode: 'adjust' | 'filter', preview: string | null }>()
const { t } = useI18n()

const basics: { key: keyof Adjust, min: number, max: number }[] = [
  { key: 'brightness', min: 0.5, max: 1.5 },
  { key: 'contrast', min: 0.5, max: 1.5 },
  { key: 'saturation', min: 0, max: 2 }
]
const advanced: { key: keyof Adjust, min: number, max: number, step?: number }[] = [
  { key: 'hue', min: -45, max: 45, step: 1 },
  { key: 'sepia', min: 0, max: 1 },
  { key: 'grayscale', min: 0, max: 1 }
]

function set(key: keyof Adjust, value: number | undefined) {
  if (value === undefined) return
  spec.value.adjust = { ...spec.value.adjust, [key]: Math.round(value * 100) / 100 }
  spec.value.preset = 'custom'
}

function applyPreset(id: string) {
  const preset = FILTER_PRESETS.find(p => p.id === id)
  if (!preset) return
  spec.value.adjust = { ...preset.adjust }
  spec.value.preset = id
}

/** Slider value shown to the creator: −100…+100 around neutral, so nobody has to think in multipliers. */
function display(key: keyof Adjust, value: number) {
  if (key === 'hue') return `${value > 0 ? '+' : ''}${Math.round(value)}`
  if (key === 'sepia' || key === 'grayscale') return `${Math.round(value * 100)}`
  const span = key === 'saturation' ? 1 : 0.5
  const n = Math.round(((value - 1) / span) * 100)
  return `${n > 0 ? '+' : ''}${n}`
}
</script>

<template>
  <div
    v-if="mode === 'filter'"
    class="flex gap-3 overflow-x-auto pb-1"
  >
    <button
      v-for="preset in FILTER_PRESETS"
      :key="preset.id"
      type="button"
      class="shrink-0 flex flex-col items-center gap-1 text-xs"
      :class="spec.preset === preset.id ? 'text-primary font-medium' : 'text-muted'"
      @click="applyPreset(preset.id)"
    >
      <span
        class="size-16 rounded-md overflow-hidden bg-elevated border-2"
        :class="spec.preset === preset.id ? 'border-primary' : 'border-transparent'"
      >
        <img
          v-if="preview"
          :src="preview"
          alt=""
          crossorigin="anonymous"
          class="size-full object-cover"
          :style="{ filter: cssFilter(preset.adjust) }"
        >
      </span>
      {{ t(preset.labelKey) }}
    </button>
  </div>
  <div
    v-else
    class="space-y-3"
  >
    <div
      v-for="item in basics"
      :key="item.key"
      class="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3 text-sm"
    >
      <span>{{ t(`mediaEditor.adjust.${item.key}`) }}</span>
      <USlider
        :model-value="spec.adjust[item.key]"
        :min="item.min"
        :max="item.max"
        :step="0.01"
        @update:model-value="set(item.key, $event)"
      />
      <span class="text-right tabular-nums text-muted">{{ display(item.key, spec.adjust[item.key]) }}</span>
    </div>
    <UCollapsible>
      <UButton
        :label="t('composer.advanced')"
        color="neutral"
        variant="link"
        size="sm"
        trailing-icon="i-lucide-chevron-down"
        class="px-0"
      />
      <template #content>
        <div class="space-y-3 pt-2">
          <div
            v-for="item in advanced"
            :key="item.key"
            class="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3 text-sm"
          >
            <span>{{ t(`mediaEditor.adjust.${item.key}`) }}</span>
            <USlider
              :model-value="spec.adjust[item.key]"
              :min="item.min"
              :max="item.max"
              :step="item.step ?? 0.01"
              @update:model-value="set(item.key, $event)"
            />
            <span class="text-right tabular-nums text-muted">{{ display(item.key, spec.adjust[item.key]) }}</span>
          </div>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
