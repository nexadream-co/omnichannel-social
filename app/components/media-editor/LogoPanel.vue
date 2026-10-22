<script setup lang="ts">
import type { Layer, WorkspaceWatermark } from '#shared/media/edit-spec'

type LogoLayer = Extract<Layer, { type: 'watermark' }>

const props = defineProps<{ layer: LogoLayer | null }>()
const emit = defineEmits<{ place: [watermark: WorkspaceWatermark], update: [layer: LogoLayer] }>()
const { t } = useI18n()
const toast = useToast()
const { watermark, load, uploadLogo, save } = useWatermark()
const input = useTemplateRef<HTMLInputElement>('file')
const busy = ref(false)

onMounted(() => load().catch(() => {}))

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  busy.value = true
  try {
    const url = await uploadLogo(file)
    const next: WorkspaceWatermark = { url, position: watermark.value?.position ?? 'bottom-right', scale: watermark.value?.scale ?? 0.18, opacity: watermark.value?.opacity ?? 0.8 }
    // Viewers and editors cannot change workspace settings; the logo still goes on this photo.
    await save(next).catch(() => null)
    emit('place', next)
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <div
        v-if="watermark"
        class="size-12 rounded-md border border-default bg-[conic-gradient(var(--ui-bg-elevated)_25%,transparent_0_50%,var(--ui-bg-elevated)_0_75%,transparent_0)] bg-[length:12px_12px] flex items-center justify-center p-1"
      >
        <img
          :src="watermark.url"
          alt=""
          class="max-h-full max-w-full object-contain"
        >
      </div>
      <UButton
        v-if="watermark"
        icon="i-lucide-stamp"
        :label="layer ? t('mediaEditor.logo.reset') : t('mediaEditor.logo.place')"
        @click="emit('place', watermark)"
      />
      <UButton
        :icon="watermark ? 'i-lucide-refresh-cw' : 'i-lucide-upload'"
        :label="watermark ? t('mediaEditor.logo.change') : t('mediaEditor.logo.upload')"
        :color="watermark ? 'neutral' : 'primary'"
        :variant="watermark ? 'soft' : 'solid'"
        :loading="busy"
        @click="input?.click()"
      />
    </div>
    <div
      v-if="layer"
      class="grid grid-cols-[6rem_1fr] items-center gap-3 text-sm"
    >
      <span>{{ t('mediaEditor.logo.opacity') }}</span>
      <USlider
        :model-value="layer.opacity"
        :min="0.1"
        :max="1"
        :step="0.05"
        @update:model-value="$event !== undefined && emit('update', { ...props.layer!, opacity: $event })"
      />
    </div>
    <p class="text-xs text-muted">
      {{ watermark ? t('mediaEditor.logo.hint') : t('mediaEditor.logo.empty') }}
    </p>
    <input
      ref="file"
      type="file"
      accept="image/png,image/webp,image/jpeg"
      class="hidden"
      @change="onFile"
    >
  </div>
</template>
