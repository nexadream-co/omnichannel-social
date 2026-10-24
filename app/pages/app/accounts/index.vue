<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { SOCIAL_ACCOUNT_STATUS_META } from '#shared/utils/status'

interface Account { id: string, platform: Platform, username: string | null, avatarUrl: string | null, status: string, createdAt: string, upcomingPosts: number, activeRules: number }
interface Channels { items: Account[], platforms: { platform: Platform, configured: boolean }[] }

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
const auth = useCreatorAuth()
const { confirm } = useConfirmDialog()
const { reach } = useMilestones()
const { spark } = useCelebrate()
useHead({ title: () => t('accounts.title') })

const data = ref<Channels | null>(null)
const selectionOpen = ref(false)
const justConnected = ref<{ platform: string } | null>(null)
const avatars = ref<Record<string, HTMLElement | null>>({})
async function load() {
  data.value = await apiFetch<Channels>('/api/app/channels', { query: { usage: 1 } })
}
onMounted(async () => {
  await load()
  selectionOpen.value = Boolean(auth.workspace.value?.needsAccountSelection)
  // Results of the OAuth round trip arrive as query params (the callback is a browser redirect).
  const error = route.query.error ? String(route.query.error) : null
  const connected = route.query.connected ? Number(route.query.connected) : 0
  const platform = route.query.platform && String(route.query.platform) in PLATFORM_META ? PLATFORM_META[String(route.query.platform) as Platform].name : ''
  if (error === 'limit_reached') useEntitlements().upgradeRequired(null, t('accounts.error.limit_reached'))
  else if (error) toast.add({ title: t(`accounts.error.${error}`, t('accounts.error.unknown')), color: 'error', duration: 8000 })
  else if (connected) {
    toast.add({ title: t('accounts.connected', { count: connected, platform }), color: 'success' })
    if (reach('firstAccountConnected')) {
      justConnected.value = { platform }
      const newest = [...(data.value?.items ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      await nextTick()
      const el = newest ? avatars.value[newest.id] : null
      if (el) spark(el)
    }
  }
  if (error || connected) await navigateTo({ query: {} }, { replace: true })
})

const canManage = computed(() => auth.hasAbility('accounts.manage'))
const COMING_SOON: Platform[] = ['tiktok', 'youtube', 'x']

function connectUrl(platform: Platform) {
  return `/api/app/channels/${platform}/connect?return=${encodeURIComponent(locale.value === 'en' ? '/en/app/accounts' : '/app/accounts')}`
}

function menuItems(account: Account) {
  return [[{ label: t('accounts.disconnect'), icon: 'i-lucide-unplug', color: 'error' as const, onSelect: () => disconnect(account) }]]
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

    <UAlert
      v-if="justConnected"
      color="success"
      variant="subtle"
      icon="i-lucide-party-popper"
      :title="t('accounts.firstConnected', { platform: justConnected.platform })"
      :actions="[{ label: t('accounts.firstPost'), to: localePath('/app/compose'), color: 'success' }]"
    />

    <UAlert
      v-if="canManage && auth.workspace.value?.needsAccountSelection && !selectionOpen"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-alert"
      class="sticky top-2 z-10"
      :title="t('billing.selectTitle')"
      :actions="[{ label: t('billing.selectNow'), color: 'warning', onClick: () => { selectionOpen = true } }]"
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
      <TransitionGroup
        v-else
        name="list"
        tag="ul"
        class="divide-y divide-default"
      >
        <li
          v-for="account in data.items"
          :key="account.id"
          class="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
        >
          <span
            :ref="(el) => { avatars[account.id] = el as HTMLElement | null }"
            class="shrink-0"
          >
            <SmartImage
              :src="account.avatarUrl"
              :alt="account.username ?? ''"
              :title="account.username"
              kind="avatar"
              class="size-10 rounded-full"
            />
          </span>
          <div class="min-w-0 flex-1 space-y-1">
            <p class="flex items-center gap-1.5 min-w-0">
              <span class="font-medium text-highlighted truncate">{{ account.username || PLATFORM_META[account.platform].name }}</span>
              <span class="text-sm text-muted flex items-center gap-1 shrink-0">
                <UIcon
                  :name="PLATFORM_META[account.platform].icon"
                  class="size-3.5"
                />
                <span class="hidden min-[420px]:inline">{{ PLATFORM_META[account.platform].name }}</span>
              </span>
            </p>
            <StatusBadge
              :value="account.status"
              :meta="SOCIAL_ACCOUNT_STATUS_META"
            />
          </div>
          <UDropdownMenu
            v-if="canManage"
            :items="menuItems(account)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              square
              :aria-label="t('common.more')"
            />
          </UDropdownMenu>
          <UButton
            v-if="canManage && account.status === 'needs_reauth'"
            :to="connectUrl(account.platform)"
            external
            size="sm"
            color="warning"
            class="basis-full justify-center sm:basis-auto sm:ml-13"
            :label="t('accounts.reconnect')"
          />
        </li>
      </TransitionGroup>
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
    <AccountSelectionDialog
      v-if="data"
      v-model:open="selectionOpen"
      :accounts="data.items"
      @saved="load"
    />
  </div>
</template>
