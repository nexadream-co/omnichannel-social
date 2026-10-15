<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth'

const props = defineProps<{ audience: 'creator' | 'staff' }>()
const { t } = useI18n()
const toast = useToast()
const auth = props.audience === 'creator' ? useCreatorAuth() : useStaffAuth()
// Google-only creators have no password yet: they create one without the old one (docs/blueprint/03 §6).
const creating = computed(() => props.audience === 'creator' && (auth.profile.value?.user as { hasPassword?: boolean } | undefined)?.hasPassword === false)

const schema = computed(() => z.object({
  currentPassword: creating.value ? z.string().optional() : z.string().min(1, t('password.wrongCurrent')),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, t('authError.passwordShort'))
}))
const state = reactive({ currentPassword: '', newPassword: '', revokeOtherSessions: true })
const saving = ref(false)
const errorKey = ref<string | null>(null)

async function save() {
  saving.value = true
  errorKey.value = null
  try {
    if (creating.value) {
      await apiFetch('/api/app/me/set-password', { method: 'POST', body: { newPassword: state.newPassword } })
      await auth.fetchProfile()
    } else {
      const { error } = await auth.client().changePassword({ currentPassword: state.currentPassword, newPassword: state.newPassword, revokeOtherSessions: state.revokeOtherSessions })
      if (error) {
        errorKey.value = error.code === 'INVALID_PASSWORD' ? 'password.wrongCurrent' : authErrorKey(error.code, error.status)
        return
      }
    }
    Object.assign(state, { currentPassword: '', newPassword: '' })
    toast.add({ title: t('password.saved'), color: 'success' })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard>
    <UForm
      :schema="schema"
      :state="state"
      class="space-y-5"
      @submit="save"
    >
      <p
        v-if="creating"
        class="text-sm text-muted"
      >
        {{ t('password.createHint') }}
      </p>
      <UAlert
        v-if="errorKey"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t(errorKey)"
      />
      <UFormField
        v-if="!creating"
        :label="t('password.current')"
        name="currentPassword"
      >
        <UInput
          v-model="state.currentPassword"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('password.new')"
        name="newPassword"
        :hint="t('auth.passwordHint')"
      >
        <UInput
          v-model="state.newPassword"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <UCheckbox
        v-if="!creating"
        v-model="state.revokeOtherSessions"
        :label="t('password.revokeOthers')"
      />
      <div class="flex justify-end">
        <UButton
          type="submit"
          :loading="saving"
          :label="creating ? t('password.createTitle') : t('password.title')"
        />
      </div>
    </UForm>
  </UCard>
</template>
