<script setup lang="ts">
import { z } from 'zod'
import { isValidIndonesianPhone } from '#shared/utils/phone'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const googleEnabled = useRuntimeConfig().public.googleEnabled
useHead({ title: () => t('auth.registerTitle') })

const schema = computed(() => z.object({
  name: z.string().trim().min(2, t('authError.nameShort')),
  email: z.email(t('authError.emailInvalid')),
  password: z.string().min(PASSWORD_MIN_LENGTH, t('authError.passwordShort')),
  phone: z.string().trim().refine(value => !value || isValidIndonesianPhone(value), 'Nomor HP tidak valid.').optional(),
  acceptTerms: z.boolean().refine(value => value, t('authError.acceptTerms'))
}))
const state = reactive({ name: '', email: '', password: '', phone: '', acceptTerms: false })
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit() {
  loading.value = true
  errorMessage.value = null
  try {
    await auth.signUp({ ...state, phone: state.phone || undefined, acceptTerms: true })
    await navigateTo({ path: localePath('/app'), query: { welcome: '1' } })
  } catch (caught) {
    // Server messages are Bahasa sentences meant to be shown verbatim (docs/blueprint/12 §4).
    errorMessage.value = extractErrorMessage(caught, t('authError.generic'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ t('auth.registerTitle') }}
        </h1>
        <p class="text-sm text-muted">
          {{ t('auth.registerSubtitle') }}
        </p>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />

      <template v-if="googleEnabled">
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-simple-icons-google"
          size="lg"
          :label="t('auth.googleButton')"
          @click="auth.signInWithGoogle('/app?welcome=1')"
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
          :label="t('auth.name')"
          name="name"
        >
          <UInput
            v-model="state.name"
            autocomplete="name"
            :placeholder="t('auth.namePlaceholder')"
            class="w-full"
            size="lg"
          />
        </UFormField>
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
          :hint="t('auth.passwordHint')"
        >
          <AuthPasswordInput
            v-model="state.password"
            autocomplete="new-password"
            meter
          />
        </UFormField>
        <UFormField
          :label="t('auth.phone')"
          name="phone"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            autocomplete="tel"
            inputmode="tel"
            placeholder="08xxxxxxxxxx"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UFormField name="acceptTerms">
          <UCheckbox v-model="state.acceptTerms">
            <template #label>
              {{ t('auth.acceptTermsPrefix') }}
              <ULink
                :to="localePath('/terms')"
                target="_blank"
                class="text-primary"
              >{{ t('auth.terms') }}</ULink>
              {{ t('auth.and') }}
              <ULink
                :to="localePath('/privacy')"
                target="_blank"
                class="text-primary"
              >{{ t('auth.privacy') }}</ULink>
            </template>
          </UCheckbox>
        </UFormField>
        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          :label="t('auth.registerButton')"
        />
      </UForm>

      <p class="text-sm text-center text-muted">
        {{ t('auth.haveAccount') }}
        <ULink
          :to="localePath('/app/auth/login')"
          class="text-primary font-medium"
        >
          {{ t('auth.loginLink') }}
        </ULink>
      </p>
    </div>
  </UCard>
</template>
