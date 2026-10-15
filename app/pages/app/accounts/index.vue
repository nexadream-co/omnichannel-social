<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { SOCIAL_ACCOUNT_STATUS_META } from '#shared/utils/status'

interface Account { id: string, platform: Platform, username: string | null, avatarUrl: string | null, status: string }
interface Channels { items: Account[], platforms: { platform: Platform, configured: boolean }[] }

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
const auth = useCreatorAuth()
const { confirm } = useConfirmDialog()
useHead({ title: () => t('accounts.title') })

const data = ref<Channels | null>(null)
async function load() {
  data.value = await apiFetch<Channels>('/api/app/channels')
}
onMounted(async () => {
  await load()
  // Results of the OAuth round trip arrive as query params (the callback is a browser redirect).
  const error = route.query.error ? String(route.query.error) : null
  const connected = route.query.connected ? Number(route.query.connected) : 0
  const platform = route.query.platform && String(route.query.platform) in PLATFORM_META ? PLATFORM_META[String(route.query.platform) as Platform].name : ''
  if (error) toast.add({ title: t(`accounts.error.${error}`, t('accounts.error.unknown')), color: 'error', duration: 8000 })
  else if (connected) toast.add({ title: t('accounts.connected', { count: connected, platform }), color: 'success' })
  if (error || connected) await navigateTo({ query: {} }, { replace: true })
})

const canManage = computed(() => auth.hasAbility('accounts.manage'))
const COMING_SOON: Platform[] = ['tiktok', 'youtube', 'x']

function connectUrl(platform: Platform) {
  return `/api/app/channels/${platform}/connect?return=${encodeURIComponent(locale.value === 'en' ? '/en/app/accounts' : '/app/accounts')}`
}

async function disconnect(account: Account) {
  const name = [PLATFORM_META[account.platform].name, account.username].filter(Boolean).join(' ')
  if (!(await confirm({ title: t('accounts.disconnectConfirm', { name }), description: t('accounts.disconnectBody'), color: 'error', confirmLabel: t('accounts.disconnect') }))) return
  try {
    await apiFetch(`/api/app/channels/accounts/${account.id}`, { method: 'DELETE' })
    toast.add({ title: t('accounts.disconnected'), color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}
</script>

<template>
  <div class="w-full max-w-3xl mx-auto space-y-6">
    <CommandBar
      :title="t('accounts.title')"
      :description="t('accounts.subtitle')"
    />

    <UAlert
      v-if="canManage && !auth.emailVerified.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-mail-warning"
      :title="t('accounts.verifyFirst')"
      :actions="[{ label: t('accounts.resend'), to: localePath('/app/auth/verify-email'), color: 'warning', variant: 'outline' }]"
    />

    <UCard
      v-if="data && (data.items.length || !canManage)"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('accounts.connectedTitle') }}
        </h2>
      </template>
      <p
        v-if="!data.items.length"
        class="p-6 text-sm text-muted"
      >
        {{ t('accounts.empty') }}
      </p>
      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="account in data.items"
          :key="account.id"
          class="px-4 py-3 flex flex-wrap items-center gap-3"
        >
          <UAvatar
            :src="account.avatarUrl ?? undefined"
            :icon="PLATFORM_META[account.platform].icon"
            :alt="account.username ?? ''"
          />
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted truncate">
              {{ account.username || PLATFORM_META[account.platform].name }}
            </p>
            <p class="text-sm text-muted flex items-center gap-1">
              <UIcon
                :name="PLATFORM_META[account.platform].icon"
                class="size-3.5"
              />
              {{ PLATFORM_META[account.platform].name }}
            </p>
          </div>
          <StatusBadge
            :value="account.status"
            :meta="SOCIAL_ACCOUNT_STATUS_META"
          />
          <template v-if="canManage">
            <UButton
              v-if="account.status === 'needs_reauth'"
              :to="connectUrl(account.platform)"
              external
              size="sm"
              color="warning"
              :label="t('accounts.reconnect')"
            />
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              :label="t('accounts.disconnect')"
              @click="disconnect(account)"
            />
          </template>
        </li>
      </ul>
    </UCard>

    <UCard v-if="data && canManage">
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('accounts.connectTitle') }}
        </h2>
      </template>
      <div class="grid gap-3 sm:grid-cols-3">
        <div
          v-for="entry in data.platforms"
          :key="entry.platform"
          class="rounded-lg border border-default p-4 flex flex-col gap-3"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="PLATFORM_META[entry.platform].icon"
              class="size-6"
            />
            <p class="font-semibold">
              {{ PLATFORM_META[entry.platform].name }}
            </p>
          </div>
          <p class="text-sm text-muted flex-1">
            {{ t(`accounts.hint.${entry.platform}`) }}
          </p>
          <UButton
            :to="entry.configured && auth.emailVerified.value ? connectUrl(entry.platform) : undefined"
            external
            :disabled="!entry.configured || !auth.emailVerified.value"
            block
            :label="entry.configured ? t('accounts.connect', { platform: PLATFORM_META[entry.platform].name }) : t('accounts.notConfigured')"
          />
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2 items-center">
        <span class="text-sm text-muted">{{ t('accounts.soon') }}:</span>
        <UBadge
          v-for="platform in COMING_SOON"
          :key="platform"
          color="neutral"
          variant="subtle"
          :icon="PLATFORM_META[platform].icon"
          :label="PLATFORM_META[platform].name"
        />
      </div>
      <p class="mt-4 text-sm text-muted">
        {{ t('accounts.help') }}
        <ULink
          to="https://help.instagram.com/502981923235522"
          target="_blank"
          class="text-primary"
        >{{ t('accounts.helpLink') }}</ULink>
      </p>
    </UCard>
    <div
      v-else-if="!data"
      class="space-y-3"
    >
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>
  </div>
</template>
