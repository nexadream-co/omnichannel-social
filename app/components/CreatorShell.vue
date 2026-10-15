<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { CREATOR_NAV } from '#shared/utils/menus'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()

const visibleNav = computed(() => CREATOR_NAV.filter(item => !item.ability || auth.hasAbility(item.ability)))

const railItems = computed<NavigationMenuItem[]>(() => visibleNav.value
  .filter(item => item.key !== 'compose')
  .map(item => ({
    label: t(item.labelKey),
    icon: item.icon,
    to: localePath(item.to),
    exact: item.to === '/app'
  })))

const bottomItems = computed(() => visibleNav.value.filter(item => item.bottomNav))
const moreItems = computed(() => visibleNav.value.filter(item => !item.bottomNav && item.key !== 'compose'))
const moreOpen = ref(false)
watch(() => route.fullPath, () => {
  moreOpen.value = false
})

function isActive(to: string) {
  const target = localePath(to)
  return to === '/app' ? route.path === target : route.path.startsWith(target)
}

const canCompose = computed(() => auth.hasAbility('posts.write'))
</script>

<template>
  <UDashboardGroup
    unit="rem"
    storage="cookie"
    storage-key="socialz-creator-rail"
  >
    <UDashboardSidebar
      id="creator-rail"
      collapsible
      :default-size="16"
      :collapsed-size="4.5"
      :ui="{ root: 'hidden lg:flex', footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          :to="localePath('/app')"
          class="font-bold text-lg text-primary truncate"
        >
          {{ collapsed ? 'S' : t('app.name') }}
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UButton
          v-if="canCompose"
          :to="localePath('/app/compose')"
          icon="i-lucide-plus"
          :label="collapsed ? undefined : t('nav.compose')"
          :square="collapsed"
          block
          class="mb-2"
        />
        <UNavigationMenu
          :items="railItems"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <UButton
          :to="localePath('/app/help')"
          icon="i-lucide-life-buoy"
          :label="collapsed ? undefined : t('nav.help')"
          color="neutral"
          variant="ghost"
          :square="collapsed"
          block
          class="justify-start"
        />
        <UDashboardSidebarCollapse />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel
      id="creator-main"
      :ui="{ body: 'pb-24 lg:pb-6' }"
    >
      <template #header>
        <UDashboardNavbar
          :toggle="false"
          :ui="{ right: 'gap-1' }"
        >
          <template #left>
            <NuxtLink
              :to="localePath('/app')"
              class="font-bold text-primary lg:hidden"
            >
              {{ t('app.name') }}
            </NuxtLink>
          </template>
          <template #right>
            <NotificationMenu audience="creator" />
            <CreatorUserMenu />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>

    <!-- Phone: bottom nav + floating compose button (docs/blueprint/13 §5) -->
    <nav class="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul class="grid grid-cols-5">
        <li
          v-for="item in bottomItems"
          :key="item.key"
        >
          <NuxtLink
            :to="localePath(item.to)"
            class="flex flex-col items-center gap-0.5 py-2 text-xs"
            :class="isActive(item.to) ? 'text-primary' : 'text-muted'"
          >
            <UIcon
              :name="item.icon"
              class="size-5"
            />
            <span class="truncate max-w-full px-1">{{ t(item.labelKey) }}</span>
          </NuxtLink>
        </li>
        <li>
          <button
            type="button"
            class="w-full flex flex-col items-center gap-0.5 py-2 text-xs text-muted"
            @click="moreOpen = true"
          >
            <UIcon
              name="i-lucide-ellipsis"
              class="size-5"
            />
            <span>{{ t('nav.more') }}</span>
          </button>
        </li>
      </ul>
    </nav>
    <UButton
      v-if="canCompose"
      :to="localePath('/app/compose')"
      icon="i-lucide-plus"
      size="xl"
      class="lg:hidden fixed right-4 bottom-20 z-40 rounded-full shadow-lg"
      :aria-label="t('nav.compose')"
    />
    <UDrawer
      v-model:open="moreOpen"
      :title="t('nav.more')"
    >
      <template #body>
        <ul class="space-y-1">
          <li
            v-for="item in moreItems"
            :key="item.key"
          >
            <UButton
              :to="localePath(item.to)"
              :icon="item.icon"
              :label="t(item.labelKey)"
              color="neutral"
              variant="ghost"
              block
              class="justify-start"
              size="lg"
            />
          </li>
        </ul>
      </template>
    </UDrawer>
    <ConfirmDialog />
  </UDashboardGroup>
</template>
