<script setup lang="ts">
const { t } = useI18n()
const { state, settle } = useConfirmDialog()
const open = computed({
  get: () => state.value.open,
  set: (value) => {
    if (!value) settle('cancel')
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
      <div class="flex flex-wrap justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="state.cancelLabel ?? t('common.cancel')"
          @click="settle('cancel')"
        />
        <!-- With a third answer, that one is the main action and confirm steps back to an outline. -->
        <UButton
          :color="state.color ?? 'primary'"
          :variant="state.extraLabel ? 'outline' : 'solid'"
          :label="state.confirmLabel ?? t('common.confirm')"
          @click="settle('confirm')"
        />
        <UButton
          v-if="state.extraLabel"
          :icon="state.extraIcon"
          :label="state.extraLabel"
          @click="settle('extra')"
        />
      </div>
    </template>
  </UModal>
</template>
