<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Buat kata sandi baru' })

const route = useRoute()
const auth = useStaffAuth()
const token = computed(() => String(route.query.token ?? ''))
const schema = z.object({ password: z.string().min(PASSWORD_MIN_LENGTH, 'Kata sandi minimal 8 karakter.') })
const state = reactive({ password: '' })
const loading = ref(false)
const done = ref(false)
const error = ref<string | null>(null)

async function onSubmit() {
  loading.value = true
  error.value = null
  const result = await auth.resetPassword(token.value, state.password)
  loading.value = false
  if (result.ok) done.value = true
  else error.value = 'Tautan sudah tidak berlaku. Silakan minta tautan baru.'
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Buat kata sandi baru
      </h1>
      <UAlert
        v-if="done"
        color="success"
        variant="subtle"
        title="Kata sandi berhasil diubah. Silakan masuk."
      />
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
      />
      <UForm
        v-if="token && !done"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Kata sandi baru"
          name="password"
          hint="Minimal 8 karakter."
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          label="Simpan kata sandi"
        />
      </UForm>
      <UButton
        v-if="done"
        to="/admin/auth/login"
        block
        size="lg"
        label="Masuk"
      />
    </div>
  </UCard>
</template>
