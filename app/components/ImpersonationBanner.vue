<script setup lang="ts">
/** Shown on every console page while staff impersonate this creator (docs/blueprint/03 §10). */
const { t } = useI18n()
const auth = useCreatorAuth()
const toast = useToast()
const stopping = ref(false)
async function stop() {
  stopping.value = true
  try {
    const result = await apiFetch<{ redirect: string }>('/api/app/impersonation/stop', { method: 'POST' })
    window.location.href = result.redirect
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
    stopping.value = false
  }
}
</script>

<template>
  <div
    v-if="auth.impersonating.value"
    class="flex items-center gap-3 px-4 py-2 bg-warning/15 text-warning text-sm border-b border-warning/30"
  >
    <UIcon
      name="i-lucide-user-round-cog"
      class="size-4 shrink-0"
    />
    <span class="flex-1 min-w-0 leading-snug">{{ t('impersonation.banner', { name: auth.profile.value?.user.name ?? '' }) }}</span>
    <UButton
      size="xs"
      color="warning"
      variant="solid"
      :label="t('impersonation.stop')"
      :loading="stopping"
      @click="stop"
    />
  </div>
</template>
