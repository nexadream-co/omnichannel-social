<script setup lang="ts">
import { editedDurationMs, MIN_VIDEO_EDIT_MS, type EditSpec } from '#shared/media/edit-spec'

const spec = defineModel<EditSpec>('spec', { required: true })
const props = defineProps<{ mode: 'trim' | 'cover' | 'sound' | string, durationMs: number }>()
const { t } = useI18n()

const seconds = (ms: number) => {
  const total = Math.max(0, ms) / 1000
  return `${Math.floor(total / 60)}:${(total % 60).toFixed(1).padStart(4, '0')}`
}

const range = computed(() => [spec.value.trim?.startMs ?? 0, spec.value.trim?.endMs ?? props.durationMs])
const kept = computed(() => editedDurationMs(spec.value, props.durationMs))

function setRange(value: number[] | undefined) {
  if (!value || value.length < 2) return
  const [start, end] = value as [number, number]
  spec.value.trim = { startMs: Math.round(start), endMs: Math.round(Math.max(end, start + MIN_VIDEO_EDIT_MS)) }
  // The cover must stay inside the part that is kept.
  if (spec.value.coverMs !== undefined && spec.value.coverMs > kept.value) spec.value.coverMs = Math.max(0, kept.value - 100)
}
</script>

<template>
  <div
    v-if="mode === 'trim'"
    class="space-y-3"
  >
    <USlider
      :model-value="range"
      :min="0"
      :max="durationMs"
      :step="100"
      :min-steps-between-thumbs="MIN_VIDEO_EDIT_MS / 100"
      @update:model-value="setRange"
    />
    <div class="flex justify-between text-sm tabular-nums">
      <span>{{ seconds(range[0]!) }}</span>
      <span class="text-muted">{{ t('mediaEditor.trim.kept', { length: seconds(kept) }) }}</span>
      <span>{{ seconds(range[1]!) }}</span>
    </div>
    <p class="text-xs text-muted">
      {{ t('mediaEditor.trim.hint') }}
    </p>
  </div>
  <div
    v-else-if="mode === 'cover'"
    class="space-y-3"
  >
    <USlider
      :model-value="spec.coverMs ?? 0"
      :min="0"
      :max="Math.max(0, kept - 100)"
      :step="100"
      @update:model-value="spec.coverMs = Math.round($event ?? 0)"
    />
    <div class="flex justify-between text-sm tabular-nums">
      <span>{{ seconds(spec.coverMs ?? 0) }}</span>
      <span class="text-xs text-muted">{{ t('mediaEditor.cover.hint') }}</span>
    </div>
  </div>
  <div
    v-else
    class="space-y-2"
  >
    <USwitch
      v-model="spec.mute"
      :label="t('mediaEditor.sound.mute')"
      :description="t('mediaEditor.sound.hint')"
    />
  </div>
</template>
