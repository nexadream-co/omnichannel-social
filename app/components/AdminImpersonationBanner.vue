<script setup lang="ts">
/** While a superadmin works as another staff member (docs/blueprint/09 §1). */
const auth = useStaffAuth()
const toast = useToast()
const stopping = ref(false)
async function stop() {
  stopping.value = true
  try {
    const result = await apiFetch<{ redirect: string }>('/api/admin/impersonation/stop', { method: 'POST' })
    window.location.href = result.redirect
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, 'Gagal berhenti menyamar.'), color: 'error' })
    stopping.value = false
  }
}
</script>

<template>
  <div
    v-if="auth.profile.value?.impersonating"
    class="flex items-center gap-3 px-4 py-2 bg-warning/15 text-warning text-sm border-b border-warning/30"
  >
    <UIcon
      name="i-lucide-user-round-cog"
      class="size-4 shrink-0"
    />
    <span class="flex-1 min-w-0 leading-snug">Kamu sedang menyamar sebagai {{ auth.profile.value.user.name }} ({{ auth.profile.value.user.role.name }}). Semua tindakan tercatat.</span>
    <UButton
      size="xs"
      color="warning"
      label="Berhenti menyamar"
      :loading="stopping"
      @click="stop"
    />
  </div>
</template>
