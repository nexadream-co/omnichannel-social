<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const { t, locale, locales, setLocale } = useI18n()
const localePath = useLocalePath()
const colorMode = useColorMode()
const auth = useCreatorAuth()

const user = computed(() => auth.profile.value?.user)

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
  if (auth.hasAbility('billing.manage')) business.push({ label: t('nav.billing'), icon: 'i-lucide-credit-card', to: localePath('/app/billing') })
  if (auth.hasAbility('settings.manage')) business.push({ label: t('nav.settings'), icon: 'i-lucide-settings', to: localePath('/app/settings') })
  if (auth.hasAbility('activity.read')) business.push({ label: t('nav.activity'), icon: 'i-lucide-scroll-text', to: localePath('/app/activity') })
  if (business.length) groups.push([{ type: 'label', label: t('nav.groupBusiness') }, ...business])
  groups.push([
    { type: 'label', label: t('nav.groupApp') },
    {
      label: t('nav.darkMode'),
      icon: 'i-lucide-moon',
      type: 'checkbox',
      checked: colorMode.value === 'dark',
      onSelect: (event: Event) => {
        event.preventDefault()
        colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
      }
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
    :content="{ align: 'end', collisionPadding: 12 }"
    :ui="{ content: 'w-60' }"
  >
    <UButton
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
