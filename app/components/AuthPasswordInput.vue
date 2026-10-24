<script setup lang="ts">
import { passwordStrength } from '~/utils/auth-errors'

defineProps<{ autocomplete?: string, meter?: boolean }>()
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const visible = ref(false)
const strength = computed(() => passwordStrength(model.value))
const STRENGTH_KEYS = ['', 'auth.strengthWeak', 'auth.strengthFair', 'auth.strengthStrong'] as const
const STRENGTH_COLORS = ['neutral', 'error', 'warning', 'success'] as const
</script>

<template>
  <div class="space-y-1.5">
    <UInput
      v-model="model"
      :type="visible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      class="w-full"
      size="lg"
      :ui="{ trailing: 'pe-1' }"
    >
      <template #trailing>
        <UButton
          type="button"
          color="neutral"
          variant="link"
          size="sm"
          :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :aria-label="visible ? t('auth.hidePassword') : t('auth.showPassword')"
          :aria-pressed="visible"
          @click="visible = !visible"
        />
      </template>
    </UInput>
    <div
      v-if="meter && model"
      class="flex items-center gap-2"
    >
      <UProgress
        :model-value="strength"
        :max="3"
        size="xs"
        :color="STRENGTH_COLORS[strength]"
        class="flex-1"
      />
      <span
        class="text-xs font-medium w-12 text-right"
        :class="strength === 3 ? 'text-success' : strength === 2 ? 'text-warning' : 'text-error'"
        aria-live="polite"
      >{{ t(STRENGTH_KEYS[strength]!) }}</span>
    </div>
  </div>
</template>
