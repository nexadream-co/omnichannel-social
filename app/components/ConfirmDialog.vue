<script setup lang="ts">
const { t } = useI18n()
const { state, settle } = useConfirmDialog()
const open = computed({
  get: () => state.value.open,
  set: (value) => {
    if (!value) settle(false)
  }
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="state.title"
    :description="state.description"
  >
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="state.cancelLabel ?? t('common.cancel')"
          @click="settle(false)"
        />
        <UButton
          :color="state.color ?? 'primary'"
          :label="state.confirmLabel ?? t('common.confirm')"
          @click="settle(true)"
        />
      </div>
    </template>
  </UModal>
</template>
