<script setup lang="ts">
defineProps<{ title: string, description?: string, loading?: boolean, submitLabel?: string, busyLabel?: string, done?: boolean, wide?: boolean }>()
const emit = defineEmits<{ submit: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="description"
    :ui="{ content: wide ? 'sm:max-w-2xl' : 'sm:max-w-lg' }"
  >
    <template #body>
      <slot />
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('common.cancel')"
          @click="open = false"
        />
        <SaveButton
          :loading="loading"
          :done="done"
          :label="submitLabel"
          :busy-label="busyLabel"
          @click="emit('submit')"
        />
      </div>
    </template>
  </USlideover>
</template>
