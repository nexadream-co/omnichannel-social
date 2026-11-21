<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/** `sidebar`: the card at the bottom of the desktop rail. `navbar`: the avatar in the phone / tablet top bar. */
const props = withDefaults(defineProps<{ collapsed?: boolean, placement?: 'navbar' | 'sidebar' }>(), { placement: 'navbar' })

const { t, locale, locales, setLocale } = useI18n()
const localePath = useLocalePath()
const colorMode = useColorMode()
const auth = useCreatorAuth()
const entitlements = useEntitlements()

const user = computed(() => auth.profile.value?.user)
const subscription = computed(() => auth.profile.value?.subscription)
const planLine = computed(() => {
  const sub = subscription.value
  if (!sub) return user.value?.email ?? ''
  return sub.status === 'trialing' ? t('nav.planTrial', { plan: sub.planName }) : sub.planName
})
const inSidebar = computed(() => props.placement === 'sidebar')
// The rail card opens upward (or to the right when the rail is collapsed); the top bar avatar opens downward.
const content = computed(() => {
  if (!inSidebar.value) return { align: 'end' as const, collisionPadding: 12 }
  return props.collapsed
    ? { side: 'right' as const, align: 'end' as const, sideOffset: 8, collisionPadding: 12 }
    : { side: 'top' as const, align: 'start' as const, sideOffset: 6, collisionPadding: 12 }
})

// Fixed account chrome, grouped under captions (docs/blueprint/13 §5). A caption with no rows is not drawn.
const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [
    [
      { type: 'label', label: t('nav.groupAccount') },
      { label: t('nav.profile'), icon: 'i-lucide-user', to: localePath('/app/profile') },
      { label: t('nav.changePassword'), icon: 'i-lucide-key-round', to: localePath('/app/change-password') }
    ]
  ]
  const business: DropdownMenuItem[] = []
  if (auth.hasAbility('accounts.manage')) business.push({ label: t('nav.accounts'), icon: 'i-lucide-at-sign', to: localePath('/app/accounts') })
  // Plan-gated entries never hide: a lock, and the page explains the upgrade (docs/blueprint/04 §2.2).
  const teamLocked = Boolean(entitlements.data.value) && !entitlements.has('teamAccess')
  if (auth.hasAbility('team.manage')) business.push({ label: t('nav.team'), icon: 'i-lucide-users', to: localePath('/app/team'), slot: teamLocked ? 'locked' as const : undefined })
  if (auth.hasAbility('billing.manage')) business.push({ label: t('nav.billing'), icon: 'i-lucide-credit-card', to: localePath('/app/billing') })
  if (auth.hasAbility('settings.manage')) business.push({ label: t('nav.settings'), icon: 'i-lucide-settings', to: localePath('/app/settings') })
  if (auth.hasAbility('activity.read')) business.push({ label: t('nav.activity'), icon: 'i-lucide-scroll-text', to: localePath('/app/activity') })
  if (business.length) groups.push([{ type: 'label', label: t('nav.groupBusiness') }, ...business])
  groups.push([
    { type: 'label', label: t('nav.groupApp') },
    {
      label: t('nav.theme'),
      icon: 'i-lucide-sun-moon',
      children: (['system', 'light', 'dark'] as const).map(mode => ({
        label: t(`nav.theme_${mode}`),
        type: 'checkbox' as const,
        checked: colorMode.preference === mode,
        onSelect: (event: Event) => {
          event.preventDefault()
          colorMode.preference = mode
        }
      }))
    },
    {
      label: t('nav.language'),
      icon: 'i-lucide-languages',
      children: locales.value.map(entry => ({
        label: entry.name ?? entry.code,
        type: 'checkbox' as const,
        checked: entry.code === locale.value,
        onSelect: () => setLocale(entry.code)
      }))
    },
    { label: t('nav.help'), icon: 'i-lucide-life-buoy', to: localePath('/app/help') }
  ])
  groups.push([{ label: t('nav.signOut'), icon: 'i-lucide-log-out', onSelect: () => auth.signOut() }])
  return groups
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="content"
    :ui="{ content: inSidebar && !collapsed ? 'w-(--reka-dropdown-menu-trigger-width) min-w-60' : 'w-60' }"
  >
    <template #locked-trailing>
      <UIcon
        name="i-lucide-lock"
        class="size-4 text-muted"
      />
    </template>
    <button
      v-if="inSidebar"
      type="button"
      :aria-label="user?.name"
      class="group/user flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left motion-safe:transition-colors hover:bg-elevated/70 data-[state=open]:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
      :class="collapsed ? 'justify-center' : ''"
    >
      <span class="relative shrink-0">
        <UAvatar
          :src="user?.image ?? undefined"
          :alt="user?.name"
          size="md"
          class="ring-2 ring-primary/20 motion-safe:transition-shadow group-hover/user:ring-primary/50"
        />
        <span
          class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-(--ui-bg)"
          aria-hidden="true"
        />
      </span>
      <span
        v-if="!collapsed"
        class="min-w-0 flex-1 leading-tight"
      >
        <span class="block truncate text-sm font-semibold text-highlighted">{{ user?.name }}</span>
        <span class="block truncate text-xs text-muted">{{ planLine }}</span>
      </span>
      <UIcon
        v-if="!collapsed"
        name="i-lucide-chevrons-up-down"
        class="size-4 shrink-0 text-dimmed motion-safe:transition-colors group-hover/user:text-default"
      />
    </button>
    <UButton
      v-else
      color="neutral"
      variant="ghost"
      :square="collapsed"
      :aria-label="user?.name"
      class="data-[state=open]:bg-elevated"
    >
      <UAvatar
        :src="user?.image ?? undefined"
        :alt="user?.name"
        size="sm"
      />
      <span
        v-if="!collapsed"
        class="truncate max-w-32 hidden sm:inline"
      >{{ user?.name }}</span>
    </UButton>
  </UDropdownMenu>
</template>
