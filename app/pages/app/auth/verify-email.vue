<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()
useHead({ title: () => t('auth.verifyTitle') })

const token = computed(() => String(route.query.token ?? ''))
const status = ref<'idle' | 'checking' | 'done' | 'failed'>(token.value ? 'checking' : 'idle')
const resent = ref(false)
const resending = ref(false)

onMounted(async () => {
  if (!token.value) return
  const result = await auth.verifyEmail(token.value)
  status.value = result.ok ? 'done' : 'failed'
})

async function resend() {
  const email = auth.profile.value?.user.email
  if (!email) return navigateTo(localePath('/app/auth/login'))
  resending.value = true
  await auth.resendVerification(email)
  resending.value = false
  resent.value = true
}
</script>

<template>
  <UCard>
    <div class="space-y-6 text-center">
      <UIcon
        :name="status === 'done' ? 'i-lucide-badge-check' : 'i-lucide-mail'"
        class="size-12 text-primary mx-auto"
      />
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('auth.verifyTitle') }}
      </h1>
      <p class="text-muted">
        <template v-if="status === 'checking'">
          {{ t('auth.verifyChecking') }}
        </template>
        <template v-else-if="status === 'done'">
          {{ t('auth.verifyDone') }}
        </template>
        <template v-else-if="status === 'failed'">
          {{ t('auth.verifyFailed') }}
        </template>
        <template v-else>
          {{ t('auth.verifyCheckInbox') }}
        </template>
      </p>
      <UAlert
        v-if="resent"
        color="success"
        variant="subtle"
        :title="t('auth.verifyResent')"
      />
      <div class="space-y-2">
        <UButton
          v-if="status === 'done'"
          :to="localePath('/app')"
          block
          size="lg"
          :label="t('auth.continueToApp')"
        />
        <UButton
          v-if="status === 'failed' || status === 'idle'"
          block
          size="lg"
          variant="soft"
          :loading="resending"
          :label="t('auth.verifyResend')"
          @click="resend"
        />
      </div>
    </div>
  </UCard>
</template>
