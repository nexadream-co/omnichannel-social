<script setup lang="ts">
import { WATERMARK_POSITIONS, type WorkspaceWatermark } from '#shared/media/edit-spec'

/** Pengaturan → Tanda air: the logo the media editor places with one tap. */
const { t } = useI18n()
const toast = useToast()
const { watermark, load, uploadLogo, save } = useWatermark()
const input = useTemplateRef<HTMLInputElement>('file')
const busy = ref(false)
const { done, trigger } = useCheckPop()
const form = reactive<Omit<WorkspaceWatermark, 'url'>>({ position: 'bottom-right', scale: 0.18, opacity: 0.8 })

onMounted(async () => {
  const current = await load(true).catch(() => null)
  if (current) Object.assign(form, { position: current.position, scale: current.scale, opacity: current.opacity })
})

async function persist(url: string | null) {
  busy.value = true
  try {
    await save(url ? { url, ...form } : null)
    trigger()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  busy.value = true
  try {
    await persist(await uploadLogo(file))
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
    busy.value = false
  }
}

const positions = computed(() => WATERMARK_POSITIONS.map(value => ({ value, label: t(`settings.watermark.position.${value}`) })))
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold text-highlighted">
        {{ t('settings.watermark.title') }}
      </h2>
      <p class="text-sm text-muted mt-1">
        {{ t('settings.watermark.subtitle') }}
      </p>
    </template>
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="size-16 rounded-md border border-default bg-elevated flex items-center justify-center p-1.5">
          <img
            v-if="watermark"
            :src="watermark.url"
            alt=""
            class="max-h-full max-w-full object-contain"
          >
          <UIcon
            v-else
            name="i-lucide-stamp"
            class="size-6 text-muted"
          />
        </div>
        <UButton
          :icon="watermark ? 'i-lucide-refresh-cw' : 'i-lucide-upload'"
          :label="watermark ? t('mediaEditor.logo.change') : t('mediaEditor.logo.upload')"
          :loading="busy"
          :variant="watermark ? 'soft' : 'solid'"
          @click="input?.click()"
        />
        <UButton
          v-if="watermark"
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          :label="t('common.remove')"
          :disabled="busy"
          @click="persist(null)"
        />
      </div>
      <template v-if="watermark">
        <UFormField :label="t('settings.watermark.positionLabel')">
          <USelect
            v-model="form.position"
            :items="positions"
            class="w-full sm:w-64"
          />
        </UFormField>
        <UFormField :label="t('mediaEditor.logo.opacity')">
          <USlider
            v-model="form.opacity"
            :min="0.1"
            :max="1"
            :step="0.05"
            class="sm:w-64"
          />
        </UFormField>
        <div class="flex justify-end">
          <SaveButton
            :loading="busy"
            :done="done"
            @click="persist(watermark.url)"
          />
        </div>
      </template>
      <p
        v-else
        class="text-xs text-muted"
      >
        {{ t('mediaEditor.logo.empty') }}
      </p>
    </div>
    <input
      ref="file"
      type="file"
      accept="image/png,image/webp,image/jpeg"
      class="hidden"
      @change="onFile"
    >
  </UCard>
</template>
