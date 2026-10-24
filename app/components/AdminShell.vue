<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

interface MenuNode { id: string, label: string, slug: string, path: string | null, icon: string | null, children: MenuNode[] }

const auth = useStaffAuth()
const colorMode = useColorMode()
const menu = useState<MenuNode[] | null>('admin:menus', () => null)

onMounted(async () => {
  if (menu.value) return
  try {
    menu.value = (await apiFetch<{ items: MenuNode[] }>('/api/admin/menus/tree')).items
  } catch {
    menu.value = []
  }
})

function toItem(node: MenuNode): NavigationMenuItem {
  return node.children.length
    ? { label: node.label, icon: node.icon ?? undefined, defaultOpen: false, children: node.children.map(toItem) }
    : { label: node.label, icon: node.icon ?? undefined, to: node.path ?? undefined }
}

// Fixed chrome first (Dasbor), then DB sections: a root without a path is a section header (docs/blueprint/04 §1.3).
const items = computed<NavigationMenuItem[][]>(() => [
  [
    { label: 'Dasbor', icon: 'i-lucide-layout-dashboard', to: '/admin/dashboard' },
    ...(auth.hasPermission('reports.read') ? [{ label: 'Laporan', icon: 'i-lucide-chart-line', to: '/admin/reports' }] : [])
  ],
  ...(menu.value ?? []).map(section => section.path
    ? [toItem(section)]
    : [{ label: section.label, type: 'label' as const }, ...section.children.map(toItem)])
])

const userItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: auth.profile.value?.user.email }],
  [
    { label: 'Profil', icon: 'i-lucide-user', to: '/admin/profile' },
    { label: 'Ubah kata sandi', icon: 'i-lucide-key-round', to: '/admin/change-password' }
  ],
  [{
    label: 'Tampilan',
    icon: 'i-lucide-sun-moon',
    children: ([['system', 'Ikuti perangkat'], ['light', 'Terang'], ['dark', 'Gelap']] as const).map(([mode, label]) => ({
      label,
      type: 'checkbox' as const,
      checked: colorMode.preference === mode,
      onSelect: (event: Event) => {
        event.preventDefault()
        colorMode.preference = mode
      }
    }))
  }],
  [{ label: 'Keluar', icon: 'i-lucide-log-out', onSelect: () => auth.signOut() }]
])

const config = useRuntimeConfig().public
const appVersion = config.appVersion
const isTestEnvironment = config.appEnv !== 'production'

// Kill switches stay visible on every admin page, so nobody forgets one is on (docs/blueprint/09 §1).
const { data: platformStatus } = useFetch<{ publishingPaused: boolean, autoReplyEnabled: boolean }>('/api/public/status', { server: false })
</script>

<template>
  <UDashboardGroup
    unit="rem"
    storage="cookie"
    storage-key="socialz-admin-rail"
  >
    <UDashboardSidebar
      id="admin-rail"
      collapsible
      resizable
      :default-size="16"
      :ui="{ footer: 'border-t border-default flex-col items-stretch' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/admin/dashboard"
          class="font-bold text-primary truncate"
        >
          {{ collapsed ? 'S' : 'Socialz.id · Admin' }}
        </NuxtLink>
      </template>
      <template #default="{ collapsed }">
        <UNavigationMenu
          v-for="(group, index) in items"
          :key="index"
          :items="group"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          popover
        />
      </template>
      <template #footer="{ collapsed }">
        <UTooltip
          :text="collapsed ? 'Lebarkan menu' : 'Ciutkan menu'"
          :content="{ side: 'right' }"
        >
          <UDashboardSidebarCollapse />
        </UTooltip>
        <p
          v-if="!collapsed"
          class="text-xs text-dimmed px-2"
        >
          v{{ appVersion }}
        </p>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="admin-main">
      <template #header>
        <UDashboardNavbar>
          <template #left>
            <UBadge
              v-if="isTestEnvironment"
              color="warning"
              variant="subtle"
              label="Test environment"
            />
          </template>
          <template #right>
            <NotificationMenu audience="staff" />
            <UDropdownMenu
              :items="userItems"
              :content="{ align: 'end' }"
            >
              <UButton
                color="neutral"
                variant="ghost"
                :label="auth.profile.value?.user.name"
                trailing-icon="i-lucide-chevron-down"
              />
            </UDropdownMenu>
          </template>
        </UDashboardNavbar>
        <AdminImpersonationBanner />
      </template>
      <template #body>
        <UAlert
          v-if="platformStatus?.publishingPaused || platformStatus?.autoReplyEnabled === false"
          color="error"
          variant="solid"
          icon="i-lucide-octagon-pause"
          class="mb-4"
          :title="[platformStatus?.publishingPaused ? 'Semua publikasi sedang dijeda.' : '', platformStatus?.autoReplyEnabled === false ? 'Balas Otomatis sedang dimatikan.' : ''].filter(Boolean).join(' ')"
          :actions="[{ label: 'Buka pengaturan', to: '/admin/settings?group=channels', color: 'neutral', variant: 'solid' }]"
        />
        <slot />
      </template>
    </UDashboardPanel>
    <ConfirmDialog />
  </UDashboardGroup>
</template>
