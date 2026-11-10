<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'

/**
 * The connected social accounts under the rail menu, so they stay one glance away now that Akun Sosial lives in the
 * user menu. Each shows its platform in brand colours; one that must be reconnected carries a warning dot.
 */
defineProps<{ collapsed?: boolean }>()

interface Account { id: string, platform: Platform, username: string | null, avatarUrl: string | null, status: string }
const SHOWN = 5

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()
const accounts = useState<Account[] | null>('rail:accounts', () => null)
const canManage = computed(() => auth.hasAbility('accounts.manage'))
const shown = computed(() => accounts.value?.slice(0, SHOWN) ?? [])
const hidden = computed(() => Math.max(0, (accounts.value?.length ?? 0) - SHOWN))

async function load() {
  try {
    accounts.value = (await apiFetch<{ items: Account[] }>('/api/app/channels')).items
  } catch {
    // The rail stays quiet; Akun Sosial shows the real error.
  }
}
onMounted(load)
// Accounts are connected and removed on Akun Sosial (and its picker): refresh once the creator leaves it.
watch(() => route.path, (_to, from) => {
  if (from?.includes('/app/accounts')) load()
})

// Instagram and Threads have handles; a Facebook Page has a name, so no "@".
const name = (account: Account) => {
  if (!account.username) return PLATFORM_META[account.platform].name
  return account.platform === 'facebook' ? account.username : `@${account.username}`
}
const tooltip = (account: Account) => account.status === 'needs_reauth' ? `${name(account)} · ${t('nav.needsReauth')}` : name(account)
</script>

<template>
  <div
    v-if="accounts && (accounts.length || canManage)"
    class="mt-5"
  >
    <div
      v-if="!collapsed"
      class="flex items-center justify-between pl-2.5 mb-1"
    >
      <span class="text-xs font-medium text-muted">{{ t('nav.accounts') }}</span>
      <UButton
        v-if="canManage && accounts.length"
        :to="localePath('/app/accounts')"
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="ghost"
        square
        :aria-label="t('nav.addAccount')"
      />
    </div>
    <ul class="space-y-0.5">
      <li
        v-for="account in shown"
        :key="account.id"
      >
        <UTooltip
          :text="tooltip(account)"
          :disabled="!collapsed"
          :content="{ side: 'right' }"
        >
          <NuxtLink
            :to="localePath('/app/accounts')"
            class="flex items-center gap-2.5 rounded-md py-1.5 text-sm motion-safe:transition-colors hover:bg-elevated/60"
            :class="collapsed ? 'justify-center' : 'px-2.5'"
            :aria-label="tooltip(account)"
          >
            <span
              class="relative shrink-0"
              :class="account.status === 'disabled' || account.status === 'revoked' ? 'opacity-50 grayscale' : ''"
            >
              <SmartImage
                :src="account.avatarUrl"
                :alt="account.username ?? ''"
                kind="avatar"
                class="size-6 rounded-full"
              />
              <PlatformBadge
                :platform="account.platform"
                size="xs"
                class="absolute -bottom-1 -right-1.5"
              />
              <span
                v-if="collapsed && account.status === 'needs_reauth'"
                class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-warning ring-2 ring-(--ui-bg)"
                aria-hidden="true"
              />
            </span>
            <span
              v-if="!collapsed"
              class="min-w-0 flex-1 truncate text-default"
            >{{ name(account) }}</span>
            <span
              v-if="!collapsed && account.status === 'needs_reauth'"
              class="size-2 shrink-0 rounded-full bg-warning"
              aria-hidden="true"
            />
          </NuxtLink>
        </UTooltip>
      </li>
      <li v-if="hidden && !collapsed">
        <NuxtLink
          :to="localePath('/app/accounts')"
          class="block rounded-md px-2.5 py-1 text-xs text-muted hover:text-default"
        >
          {{ t('nav.moreAccounts', { n: hidden }) }}
        </NuxtLink>
      </li>
    </ul>
    <UButton
      v-if="!accounts.length && canManage"
      :to="localePath('/app/accounts')"
      icon="i-lucide-plus"
      :label="collapsed ? undefined : t('nav.connectAccount')"
      :aria-label="t('nav.connectAccount')"
      :square="collapsed"
      color="neutral"
      variant="soft"
      size="sm"
      block
      class="justify-start"
    />
  </div>
</template>
