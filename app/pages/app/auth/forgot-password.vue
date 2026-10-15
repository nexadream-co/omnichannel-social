<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
useHead({ title: () => t('auth.forgotTitle') })

const schema = computed(() => z.object({ email: z.email(t('authError.emailInvalid')) }))
const state = reactive({ email: '' })
const loading = ref(false)
const sent = ref(false)
const errorKey = ref<string | null>(null)

async function onSubmit() {
  loading.value = true
  errorKey.value = null
  const result = await auth.requestPasswordReset(state.email)
  loading.value = false
  // Always the same answer unless rate-limited (no account enumeration).
  if (!result.ok && result.status === 429) errorKey.value = 'authError.rateLimited'
  else sent.value = true
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ t('auth.forgotTitle') }}
        </h1>
        <p class="text-sm text-muted">
          {{ t('auth.forgotSubtitle') }}
        </p>
      </div>
      <UAlert
        v-if="sent"
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        :title="t('auth.forgotSent')"
      />
      <UAlert
        v-if="errorKey"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t(errorKey)"
      />
      <UForm
        v-if="!sent"
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
        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          :label="t('auth.forgotButton')"
        />
      </UForm>
      <UButton
        :to="localePath('/app/auth/login')"
        variant="link"
        icon="i-lucide-arrow-left"
        :label="t('common.back')"
        class="px-0"
      />
    </div>
  </UCard>
</template>
