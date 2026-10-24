<script setup lang="ts">
/** Rupiah field: plain text with thousand separators, no stepper. The model is an integer or null. */
const model = defineModel<number | null>({ default: null })
const props = defineProps<{ placeholder?: string }>()
const { locale } = useI18n()

const format = (value: number | null) => value ? new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'id-ID').format(value) : ''
const text = ref(format(model.value))
watch(model, (value) => {
  if (parseDigits(text.value) !== value) text.value = format(value)
})

function parseDigits(raw: string): number | null {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  return digits ? Number(digits) : null
}

function onInput(raw: string | number) {
  const value = parseDigits(String(raw))
  model.value = value
  text.value = format(value)
}
</script>

<template>
  <UInput
    :model-value="text"
    inputmode="numeric"
    autocomplete="off"
    :placeholder="props.placeholder ?? '0'"
    class="w-full"
    @update:model-value="onInput"
  >
    <template #leading>
      <span class="text-sm text-muted">Rp</span>
    </template>
  </UInput>
</template>
