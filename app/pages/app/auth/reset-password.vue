<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()
useHead({ title: () => t('auth.resetTitle') })

const token = computed(() => String(route.query.token ?? ''))
const schema = computed(() => z.object({ password: z.string().min(PASSWORD_MIN_LENGTH, t('authError.passwordShort')) }))
const state = reactive({ password: '' })
const loading = ref(false)
const done = ref(false)
const errorKey = ref<string | null>(null)

async function onSubmit() {
  loading.value = true
  errorKey.value = null
  const result = await auth.resetPassword(token.value, state.password)
  loading.value = false
  if (result.ok) done.value = true
  else errorKey.value = authErrorKey(result.code === 'INVALID_TOKEN' || result.status === 400 ? 'INVALID_TOKEN' : result.code, result.status)
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('auth.resetTitle') }}
      </h1>
      <UAlert
        v-if="!token"
        color="warning"
        variant="subtle"
        icon="i-lucide-link-2-off"
        :title="t('auth.resetMissingToken')"
      />
      <UAlert
        v-if="done"
        color="success"
        variant="subtle"
        icon="i-lucide-check"
        :title="t('auth.resetDone')"
      />
      <UAlert
        v-if="errorKey"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t(errorKey)"
      />
      <UForm
        v-if="token && !done"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          :label="t('auth.newPassword')"
          name="password"
          :hint="t('auth.passwordHint')"
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
          :label="t('auth.resetButton')"
        />
      </UForm>
      <UButton
        v-if="done || !token"
        :to="localePath(done ? '/app/auth/login' : '/app/auth/forgot-password')"
        block
        size="lg"
        :label="done ? t('auth.loginButton') : t('auth.forgotButton')"
      />
    </div>
  </UCard>
</template>
