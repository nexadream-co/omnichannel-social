<script setup lang="ts">
import { z } from 'zod'

// /admin is Bahasa only, by design (docs/blueprint/13 §3, 16 §7).
definePageMeta({ layout: 'auth' })
useHead({ title: 'Masuk back-office' })

const route = useRoute()
const auth = useStaffAuth()
const schema = z.object({ email: z.email('Format email tidak valid.'), password: z.string().min(1, 'Masukkan kata sandi.') })
const state = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref<string | null>(null)

const MESSAGES: Record<string, string> = {
  'authError.rateLimited': 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
  'authError.invalidCredentials': 'Email atau kata sandi salah.',
  'authError.generic': 'Terjadi kesalahan. Coba lagi sebentar lagi.'
}

async function onSubmit() {
  loading.value = true
  error.value = null
  const result = await auth.signIn(state)
  loading.value = false
  if (!result.ok) {
    error.value = MESSAGES[authErrorKey(result.code, result.status)] ?? MESSAGES['authError.generic']!
    return
  }
  await navigateTo(safeRedirect(route.query.redirect, '/admin/dashboard'))
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-highlighted">
          Masuk back-office
        </h1>
        <p class="text-sm text-muted">
          Khusus tim Socialz.id.
        </p>
      </div>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
      <UForm
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
        <UFormField
          label="Kata sandi"
          name="password"
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <div class="flex justify-end">
          <ULink
            to="/admin/auth/forgot-password"
            class="text-sm text-primary"
          >
            Lupa kata sandi?
          </ULink>
        </div>
        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          label="Masuk"
        />
      </UForm>
    </div>
  </UCard>
</template>
