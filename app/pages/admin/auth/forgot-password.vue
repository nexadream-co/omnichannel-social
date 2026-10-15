<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Lupa kata sandi' })

const auth = useStaffAuth()
const schema = z.object({ email: z.email('Format email tidak valid.') })
const state = reactive({ email: '' })
const loading = ref(false)
const sent = ref(false)

async function onSubmit() {
  loading.value = true
  await auth.requestPasswordReset(state.email)
  loading.value = false
  sent.value = true
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Lupa kata sandi
      </h1>
      <UAlert
        v-if="sent"
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        title="Kalau email itu terdaftar, tautan sudah kami kirim."
      />
      <UForm
        v-else
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Email"
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          label="Kirim tautan"
        />
      </UForm>
      <UButton
        to="/admin/auth/login"
        variant="link"
        icon="i-lucide-arrow-left"
        label="Kembali"
        class="px-0"
      />
    </div>
  </UCard>
</template>
