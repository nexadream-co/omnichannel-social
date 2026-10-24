<script setup lang="ts">
/**
 * A day picker made of chips ("Tanpa tanggal", "Besok", "Sab 26"…) plus "Pilih…" for any other date.
 * `modelValue` is a local date ('YYYY-MM-DD') or '' for no date.
 */
const props = defineProps<{ modelValue: string, chips: { value: string, label: string }[], min?: string, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()

const custom = computed(() => props.modelValue !== '' && !props.chips.some(c => c.value === props.modelValue))
const picking = ref(false)
const showInput = computed(() => picking.value || custom.value)

function choose(value: string) {
  picking.value = false
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="chip in chips"
        :key="chip.value || 'none'"
        size="sm"
        :color="modelValue === chip.value ? 'primary' : 'neutral'"
        :variant="modelValue === chip.value ? 'solid' : 'outline'"
        :label="chip.label"
        :aria-pressed="modelValue === chip.value"
        :disabled="disabled"
        @click="choose(chip.value)"
      />
      <UButton
        size="sm"
        icon="i-lucide-calendar"
        :color="showInput ? 'primary' : 'neutral'"
        :variant="showInput ? 'solid' : 'outline'"
        :label="t('calendar.pickDate')"
        :aria-pressed="showInput"
        :disabled="disabled"
        @click="picking = !picking"
      />
    </div>
    <UInput
      v-if="showInput"
      :model-value="modelValue"
      type="date"
      :min="min"
      :disabled="disabled"
      class="w-full sm:w-56"
      @update:model-value="emit('update:modelValue', String($event ?? ''))"
    />
  </div>
</template>
