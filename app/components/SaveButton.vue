<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  done?: boolean
  label?: string
  busyLabel?: string
  doneLabel?: string
  icon?: string
  type?: 'button' | 'submit'
  block?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  color?: 'primary' | 'neutral' | 'success' | 'error' | 'warning' | 'info' | 'secondary'
}>()

const { t } = useI18n()
const text = computed(() => {
  if (props.done) return props.doneLabel ?? t('common.saved')
  if (props.loading) return props.busyLabel ?? t('busy.saving')
  return props.label ?? t('common.save')
})
</script>

<template>
  <UButton
    :type="type ?? 'button'"
    :loading="loading"
    :icon="done ? 'i-lucide-check' : icon"
    :label="text"
    :color="done ? 'success' : color"
    :block="block"
    :size="size"
  />
</template>
