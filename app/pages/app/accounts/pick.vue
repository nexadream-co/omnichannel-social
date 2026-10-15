<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'

interface Session { platform: Platform, accounts: { externalId: string, username: string | null, avatarUrl: string | null, alreadyConnected: boolean }[] }

definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
useHead({ title: () => t('accounts.pickTitle') })

const sessionId = String(route.query.session ?? '')
const session = ref<Session | null>(null)
const expired = ref(false)
const selected = ref<string[]>([])
const saving = ref(false)

onMounted(async () => {
  try {
    session.value = await apiFetch<Session>(`/api/app/channels/sessions/${encodeURIComponent(sessionId)}`)
    selected.value = session.value.accounts.filter(a => !a.alreadyConnected).map(a => a.externalId)
  } catch {
    expired.value = true
  }
})

function toggle(id: string, on: boolean) {
  selected.value = on ? [...selected.value, id] : selected.value.filter(x => x !== id)
}

async function save() {
  saving.value = true
  try {
    const result = await apiFetch<{ connected: number }>(`/api/app/channels/sessions/${encodeURIComponent(sessionId)}`, { method: 'POST', body: { externalIds: selected.value } })
    toast.add({ title: t('accounts.connected', { count: result.connected, platform: PLATFORM_META[session.value!.platform].name }), color: 'success' })
    await navigateTo(localePath('/app/accounts'))
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('accounts.error.unknown')), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-xl mx-auto">
    <CommandBar
      :title="t('accounts.pickTitle')"
      :description="t('accounts.pickSubtitle')"
    />
    <UAlert
      v-if="expired"
      color="warning"
      variant="subtle"
      :title="t('accounts.pickExpired')"
      :actions="[{ label: t('common.back'), to: localePath('/app/accounts') }]"
    />
    <UCard
      v-else-if="session"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="account in session.accounts"
          :key="account.externalId"
          class="px-4 py-3 flex items-center gap-3"
        >
          <UCheckbox
            :model-value="selected.includes(account.externalId)"
            :disabled="account.alreadyConnected"
            @update:model-value="(on: boolean | 'indeterminate') => toggle(account.externalId, on === true)"
          />
          <UAvatar
            :src="account.avatarUrl ?? undefined"
            :icon="PLATFORM_META[session.platform].icon"
          />
          <span class="flex-1 min-w-0 truncate font-medium">{{ account.username }}</span>
          <UBadge
            v-if="account.alreadyConnected"
            color="neutral"
            variant="subtle"
            :label="t('accounts.alreadyConnected')"
          />
        </li>
      </ul>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            :to="localePath('/app/accounts')"
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
          />
          <UButton
            :disabled="!selected.length"
            :loading="saving"
            :label="t('accounts.pickButton')"
            @click="save"
          />
        </div>
      </template>
    </UCard>
  </div>
</template>
