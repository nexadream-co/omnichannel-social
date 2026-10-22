<script setup lang="ts">
import { ASPECT_RATIO, type Aspect, type EditSpec } from '#shared/media/edit-spec'
import { ASPECT_OPTIONS } from '#shared/media/presets'

const spec = defineModel<EditSpec>('spec', { required: true })
const emit = defineEmits<{ aspect: [aspect: Aspect], rotate: [], blur: [on: boolean] }>()
const { t } = useI18n()

const canBlur = computed(() => ASPECT_RATIO[spec.value.aspect] !== null)
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2 overflow-x-auto pb-1">
      <UButton
        v-for="option in ASPECT_OPTIONS"
        :key="option.aspect"
        :label="t(option.labelKey)"
        size="sm"
        :color="spec.aspect === option.aspect ? 'primary' : 'neutral'"
        :variant="spec.aspect === option.aspect ? 'solid' : 'outline'"
        class="shrink-0"
        @click="emit('aspect', option.aspect)"
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        icon="i-lucide-rotate-cw"
        :label="t('mediaEditor.rotate')"
        size="sm"
        color="neutral"
        variant="soft"
        @click="emit('rotate')"
      />
      <UButton
        icon="i-lucide-flip-horizontal-2"
        :label="t('mediaEditor.flip')"
        size="sm"
        color="neutral"
        :variant="spec.flipH ? 'solid' : 'soft'"
        @click="spec.flipH = !spec.flipH"
      />
      <USwitch
        v-if="canBlur"
        :model-value="spec.fit === 'blur'"
        :label="t('mediaEditor.fitBlur')"
        class="ms-auto"
        @update:model-value="emit('blur', Boolean($event))"
      />
    </div>
    <p class="text-xs text-muted">
      {{ spec.fit === 'blur' ? t('mediaEditor.fitBlurHint') : t('mediaEditor.cropHint') }}
    </p>
  </div>
</template>
