<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth'

interface Preview { email: string, name: string | null, role: 'editor' | 'viewer', workspaceName: string, expiresAt: string, accountExists: boolean, needsPassword: boolean, otherWorkspaceName: string | null }

definePageMeta({ layout: 'auth' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()
useHead({ title: () => t('invite.title') })

const token = String(route.query.token ?? '')
const preview = ref<Preview | null>(null)
const invalid = ref(!token)
const done = ref(false)
onMounted(async () => {
  if (!token) return
  try {
    preview.value = await $fetch<Preview>(`/api/public/invitations/${encodeURIComponent(token)}`)
    state.name = preview.value.name ?? ''
  } catch {
    invalid.value = true
  }
})

const schema = computed(() => z.object({
  name: preview.value?.needsPassword ? z.string().trim().min(2, t('authError.nameShort')) : z.string().optional(),
  password: preview.value?.needsPassword ? z.string().min(PASSWORD_MIN_LENGTH, t('authError.passwordShort')) : z.string().optional()
}))
const state = reactive({ name: '', password: '' })
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function accept() {
  loading.value = true
  errorMessage.value = null
  try {
    const result = await apiFetch<{ signInRequired: boolean }>('/api/app/team/accept', {
      method: 'POST',
      body: { token, ...(preview.value?.needsPassword ? { name: state.name, password: state.password } : {}) }
    })
    if (result.signInRequired) {
      done.value = true
      return
    }
    auth.reset()
    await navigateTo(localePath('/app'))
  } catch (caught) {
    errorMessage.value = extractErrorMessage(caught, t('authError.generic'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('invite.title') }}
      </h1>
      <UAlert
        v-if="invalid"
        color="warning"
        variant="subtle"
        icon="i-lucide-link-2-off"
        :title="t('invite.invalid')"
      />
      <template v-else-if="preview">
        <p class="text-muted">
          {{ t('invite.joinAs', { workspace: preview.workspaceName, role: t(`role.${preview.role}.label`) }) }}
          {{ t('invite.expires', { date: formatDate(preview.expiresAt, { locale }) }) }}
        </p>
        <UAlert
          v-if="preview.otherWorkspaceName"
          color="error"
          variant="subtle"
          :title="t('invite.otherWorkspace', { workspace: preview.otherWorkspaceName })"
        />
        <UAlert
          v-else-if="done"
          color="success"
          variant="subtle"
          :title="t('invite.signInNow')"
          :actions="[{ label: t('auth.loginButton'), to: localePath('/app/auth/login') }]"
        />
        <template v-else>
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="errorMessage"
          />
          <UForm
            :schema="schema"
            :state="state"
            class="space-y-4"
            @submit="accept"
          >
            <UFormField :label="t('auth.email')">
              <UInput
                :model-value="preview.email"
                disabled
                class="w-full"
                size="lg"
              />
            </UFormField>
            <template v-if="preview.needsPassword">
              <UFormField
                :label="t('invite.yourName')"
                name="name"
              >
                <UInput
                  v-model="state.name"
                  autocomplete="name"
                  class="w-full"
                  size="lg"
                />
              </UFormField>
              <UFormField
                :label="t('invite.createPassword')"
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
            </template>
            <UButton
              type="submit"
              block
              size="lg"
              :loading="loading"
              :label="t('invite.accept')"
            />
          </UForm>
        </template>
      </template>
      <div
        v-else
        class="space-y-3"
      >
        <USkeleton class="h-5 w-full" />
        <USkeleton class="h-10 w-full" />
      </div>
    </div>
  </UCard>
</template>
