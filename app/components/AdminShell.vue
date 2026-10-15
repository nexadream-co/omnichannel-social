<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

interface MenuNode { id: string, label: string, slug: string, path: string | null, icon: string | null, children: MenuNode[] }

const auth = useStaffAuth()
const colorMode = useColorMode()
const menu = useState<MenuNode[] | null>('admin:menus', () => null)

onMounted(async () => {
  if (menu.value) return
  try {
    menu.value = (await apiFetch<{ items: MenuNode[] }>('/api/admin/menus')).items
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
  [{ label: 'Dasbor', icon: 'i-lucide-layout-dashboard', to: '/admin/dashboard' }],
  ...(menu.value ?? []).map(section => section.path
    ? [toItem(section)]
    : [{ label: section.label, type: 'label' as const }, ...section.children.map(toItem)])
])

const userItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: auth.profile.value?.user.email }],
  [{
    label: 'Mode gelap',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onSelect: (event: Event) => {
      event.preventDefault()
      colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
    }
  }],
  [{ label: 'Keluar', icon: 'i-lucide-log-out', onSelect: () => auth.signOut() }]
])

const appVersion = useRuntimeConfig().public.appVersion
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
        <UDashboardSidebarCollapse />
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
          <template #right>
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
      </template>
      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
