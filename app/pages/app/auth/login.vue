<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()
const googleEnabled = useRuntimeConfig().public.googleEnabled
useHead({ title: () => t('auth.loginTitle') })

const schema = computed(() => z.object({
  email: z.email(t('authError.emailInvalid')),
  password: z.string().min(1, t('authError.invalidCredentials'))
}))
const state = reactive({ email: '', password: '' })
const loading = ref(false)
const errorKey = ref<string | null>(null)

const callbackErrors: Record<string, string> = {
  cancelled: 'authError.cancelled',
  unavailable: 'authError.unavailable',
  account_inactive: 'authError.accountInactive'
}
const callbackError = computed(() => {
  const code = String(route.query.error ?? '')
  return code ? (callbackErrors[code] ?? 'authError.unavailable') : null
})

async function onSubmit() {
  loading.value = true
  errorKey.value = null
  const result = await auth.signIn(state)
  loading.value = false
  if (!result.ok) {
    errorKey.value = authErrorKey(result.code, result.status)
    return
  }
  await navigateTo(safeRedirect(route.query.redirect, localePath('/app')))
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ t('auth.loginTitle') }}
        </h1>
        <p class="text-sm text-muted">
          {{ t('auth.loginSubtitle') }}
        </p>
      </div>

      <UAlert
        v-if="errorKey || callbackError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t((errorKey || callbackError)!)"
      />

      <template v-if="googleEnabled">
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-simple-icons-google"
          size="lg"
          :label="t('auth.googleButton')"
          @click="auth.signInWithGoogle(safeRedirect(route.query.redirect, '/app'))"
        />
        <USeparator :label="t('common.or')" />
      </template>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          :label="t('auth.email')"
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            inputmode="email"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UFormField
          :label="t('auth.password')"
          name="password"
        >
          <AuthPasswordInput
            v-model="state.password"
            autocomplete="current-password"
          />
        </UFormField>
        <div class="flex justify-end">
          <ULink
            :to="localePath('/app/auth/forgot-password')"
            class="text-sm text-primary"
          >
            {{ t('auth.forgotLink') }}
          </ULink>
        </div>
        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          :label="t('auth.loginButton')"
        />
      </UForm>

      <p class="text-sm text-center text-muted">
        {{ t('auth.noAccount') }}
        <ULink
          :to="localePath('/app/auth/register')"
          class="text-primary font-medium"
        >
          {{ t('auth.registerLink') }}
        </ULink>
      </p>
    </div>
  </UCard>
</template>
