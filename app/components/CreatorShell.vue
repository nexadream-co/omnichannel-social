<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { CREATOR_NAV, type CreatorNavItem } from '#shared/utils/menus'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()
const entitlements = useEntitlements()
onMounted(() => entitlements.load())
// Hidden when the plan already has every feature, or when this role can't buy (docs/blueprint/06 §6).
const showUpgrade = computed(() => Boolean(entitlements.data.value) && !entitlements.hasEveryFeature.value && auth.hasAbility('billing.manage'))

const canCompose = computed(() => auth.hasAbility('posts.write'))

const visibleNav = computed(() => CREATOR_NAV.filter(item => !item.ability || auth.hasAbility(item.ability)))

// A feature that just flipped to unlocked (after paying) shows an open lock for a moment instead of the closed one.
const justUnlocked = ref(new Set<string>())
watch(() => entitlements.data.value?.features, (next, prev) => {
  if (!next || !prev) return
  for (const item of CREATOR_NAV) {
    if (!item.feature || prev[item.feature] || !next[item.feature]) continue
    justUnlocked.value = new Set(justUnlocked.value).add(item.key)
    setTimeout(() => {
      const rest = new Set(justUnlocked.value)
      rest.delete(item.key)
      justUnlocked.value = rest
    }, 1200)
  }
})

// Plan-gated entries never hide: they show a lock and the page explains the upgrade (docs/blueprint/04 §2.2).
function lockIcon(item: CreatorNavItem): string | undefined {
  if (justUnlocked.value.has(item.key)) return 'i-lucide-lock-open'
  return item.feature && entitlements.data.value && !entitlements.has(item.feature) ? 'i-lucide-lock' : undefined
}

const railItems = computed<NavigationMenuItem[]>(() => visibleNav.value
  .filter(item => item.key !== 'compose')
  .map(item => ({
    label: t(item.labelKey),
    icon: item.icon,
    to: localePath(item.to),
    exact: item.to === '/app',
    trailingIcon: lockIcon(item)
  })))

const bottomItems = computed(() => visibleNav.value.filter(item => item.bottomNav))
const bottomLeft = computed(() => bottomItems.value.slice(0, 2))
const bottomRight = computed(() => bottomItems.value.slice(2))
// "Lainnya": the product tools first (Link Produk, Etalase), then the rest in rail order.
const MORE_FIRST = ['links', 'bio']
const moreItems = computed(() => {
  const rest = visibleNav.value.filter(item => !item.bottomNav && !item.bottomNavCenter)
  return [...MORE_FIRST.map(key => rest.find(item => item.key === key)).filter(item => item !== undefined), ...rest.filter(item => !MORE_FIRST.includes(item.key))]
})
const navColumns = computed(() => bottomItems.value.length + 1 + (canCompose.value ? 1 : 0))

// Focus mode: a page with a sticky action bar hides the phone bottom nav (StickyActionBar counts itself in).
const actionBars = useState<number>('shell:actionBars', () => 0)
// Phone navbar shows the page title once the page's own heading has scrolled away (CommandBar sets it).
const pageTitle = useState<{ title: string, visible: boolean }>('shell:pageTitle', () => ({ title: '', visible: true }))
const moreOpen = ref(false)
watch(() => route.fullPath, () => {
  moreOpen.value = false
})

function isActive(to: string) {
  const target = localePath(to)
  return to === '/app' ? route.path === target : route.path.startsWith(target)
}
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
      :ui="{ root: 'hidden lg:flex', footer: 'border-t border-default flex-col items-stretch' }"
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
        <UTooltip
          v-if="showUpgrade"
          :text="t('upgrade.rail')"
          :disabled="!collapsed"
          :content="{ side: 'right' }"
        >
          <UButton
            :to="localePath('/app/billing')"
            icon="i-lucide-sparkles"
            :label="collapsed ? undefined : t('upgrade.rail')"
            :aria-label="t('upgrade.rail')"
            variant="soft"
            :square="collapsed"
            block
            class="justify-start"
          />
        </UTooltip>
        <UTooltip
          :text="t('nav.help')"
          :disabled="!collapsed"
          :content="{ side: 'right' }"
        >
          <UButton
            :to="localePath('/app/help')"
            icon="i-lucide-life-buoy"
            :label="collapsed ? undefined : t('nav.help')"
            :aria-label="t('nav.help')"
            color="neutral"
            variant="ghost"
            :square="collapsed"
            block
            class="justify-start"
          />
        </UTooltip>
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
            <div class="flex min-w-0 items-center gap-2 lg:hidden">
              <NuxtLink
                :to="localePath('/app')"
                class="font-bold text-primary shrink-0"
              >
                {{ t('app.name') }}
              </NuxtLink>
              <Transition name="fade">
                <span
                  v-if="pageTitle.title && !pageTitle.visible"
                  class="truncate border-l border-default pl-2 text-sm font-semibold text-highlighted"
                >{{ pageTitle.title }}</span>
              </Transition>
            </div>
          </template>
          <template #right>
            <NotificationMenu audience="creator" />
            <CreatorUserMenu />
          </template>
        </UDashboardNavbar>
        <ImpersonationBanner />
        <TrialBanner />
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>

    <!-- Phone: bottom nav with a raised "Buat" in the centre (docs/blueprint/13 §5) -->
    <nav
      v-show="actionBars === 0"
      class="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      :aria-label="t('shell.mainNav')"
    >
      <ul
        class="grid"
        :style="{ gridTemplateColumns: `repeat(${navColumns}, minmax(0, 1fr))` }"
      >
        <li
          v-for="item in bottomLeft"
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
              :class="isActive(item.to) ? 'motion-safe:animate-nav-pop' : ''"
            />
            <span class="truncate max-w-full px-1">{{ t(item.labelKey) }}</span>
          </NuxtLink>
        </li>
        <li v-if="canCompose">
          <NuxtLink
            :to="localePath('/app/compose')"
            class="flex flex-col items-center gap-0.5 pb-2 text-xs"
            :class="isActive('/app/compose') ? 'text-primary' : 'text-muted'"
            :aria-label="t('nav.compose')"
          >
            <span class="-mt-5 grid size-14 place-items-center rounded-full bg-primary text-inverted shadow-lg ring-4 ring-(--ui-bg)">
              <UIcon
                name="i-lucide-plus"
                class="size-6"
                :class="isActive('/app/compose') ? 'motion-safe:animate-nav-pop' : ''"
              />
            </span>
            <span class="font-medium">{{ t('nav.create') }}</span>
          </NuxtLink>
        </li>
        <li
          v-for="item in bottomRight"
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
              :class="isActive(item.to) ? 'motion-safe:animate-nav-pop' : ''"
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
    <UDrawer
      v-model:open="moreOpen"
      :title="t('nav.more')"
    >
      <template #body>
        <ul class="grid grid-cols-3 gap-2">
          <li
            v-for="item in moreItems"
            :key="item.key"
          >
            <NuxtLink
              :to="localePath(item.to)"
              class="relative flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-default p-2 text-center text-xs text-highlighted motion-safe:transition-colors hover:bg-elevated/60 active:bg-elevated"
            >
              <UIcon
                :name="item.icon"
                class="size-6 text-primary"
              />
              <span class="max-w-full break-words">{{ t(item.labelKey) }}</span>
              <Transition name="fade">
                <UIcon
                  v-if="lockIcon(item)"
                  :name="lockIcon(item)!"
                  class="absolute right-1.5 top-1.5 size-3.5 text-muted"
                />
              </Transition>
            </NuxtLink>
          </li>
        </ul>
      </template>
    </UDrawer>
    <ConfirmDialog />
    <UpgradeDialog />
    <MediaEditorHost />
  </UDashboardGroup>
</template>
