<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Terima undangan staf' })

const route = useRoute()
const token = String(route.query.token ?? '')
const invite = ref<{ email: string, name: string | null, roleName: string, expiresAt: string } | null>(null)
const error = ref<string | null>(null)
const done = ref(false)
const loading = ref(false)
const schema = z.object({ name: z.string().trim().min(2, 'Nama minimal 2 karakter.'), password: z.string().min(PASSWORD_MIN_LENGTH, 'Kata sandi minimal 8 karakter.') })
const state = reactive({ name: '', password: '' })

onMounted(async () => {
  if (!token) {
    error.value = 'Tautan undangan tidak lengkap.'
    return
  }
  try {
    invite.value = await apiFetch('/api/admin/staff-invitations/preview', { query: { token } })
    state.name = invite.value!.name ?? ''
  } catch (caught) {
    error.value = extractErrorMessage(caught, 'Undangan ini sudah tidak berlaku.')
  }
})

async function onSubmit() {
  loading.value = true
  error.value = null
  try {
    await apiFetch('/api/admin/staff-invitations/accept', { method: 'POST', body: { token, name: state.name, password: state.password } })
    done.value = true
  } catch (caught) {
    error.value = extractErrorMessage(caught, 'Undangan gagal diterima.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">
          Gabung ke tim Socialz.id
        </h1>
        <p
          v-if="invite"
          class="text-sm text-muted mt-1"
        >
          Undangan untuk {{ invite.email }} sebagai {{ invite.roleName }}.
        </p>
      </div>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
      />
      <template v-if="done">
        <UAlert
          color="success"
          variant="subtle"
          title="Akun staf sudah dibuat. Silakan masuk."
        />
        <UButton
          to="/admin/auth/login"
          block
          label="Masuk"
        />
      </template>
      <UForm
        v-else-if="invite"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Nama"
          name="name"
        >
          <UInput
            v-model="state.name"
            autocomplete="name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Kata sandi"
          name="password"
          hint="Minimal 8 karakter."
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
          label="Buat akun staf"
        />
      </UForm>
    </div>
  </UCard>
</template>
