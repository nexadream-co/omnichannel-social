<script setup lang="ts">
import { CREATOR_NAV } from '#shared/utils/menus'

/**
 * The tabs of Postingan, one entry in the menu: Kalender, Semua postingan, Galeri Media, Template. Each tab is its own page
 * (and address), so links such as /app/posts?tab=failed keep working.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()

const LABEL: Record<string, string> = { calendar: 'nav.hubCalendar', posts: 'nav.hubList', media: 'nav.media', templates: 'nav.templates' }
// Phone: four equal tabs need short labels.
const SHORT: Record<string, string> = { posts: 'nav.hubListShort', media: 'nav.hubMediaShort' }
const ICON: Record<string, string> = { calendar: 'i-lucide-calendar-days', posts: 'i-lucide-list', media: 'i-lucide-images', templates: 'i-lucide-bookmark' }
const tabs = computed(() => CREATOR_NAV
  .filter(item => (item.key === 'calendar' || item.hub === 'calendar') && (!item.ability || auth.hasAbility(item.ability)))
  .map(item => ({ key: item.key, to: localePath(item.to), label: t(LABEL[item.key] ?? item.labelKey), short: t(SHORT[item.key] ?? LABEL[item.key] ?? item.labelKey), icon: ICON[item.key] ?? item.icon })))
</script>

<template>
  <nav
    :aria-label="t('nav.postsHub')"
    class="mb-4"
  >
    <!-- Phone: four equal tabs across the screen, short labels only; wider screens add the icons and full labels. -->
    <ul class="flex w-full gap-1 rounded-lg bg-elevated p-1 sm:inline-flex sm:w-auto">
      <li
        v-for="tab in tabs"
        :key="tab.key"
        class="flex-1 sm:flex-none"
      >
        <NuxtLink
          :to="tab.to"
          :aria-current="route.path.startsWith(tab.to) ? 'page' : undefined"
          class="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium motion-safe:transition-colors sm:px-3"
          :class="route.path.startsWith(tab.to) ? 'bg-default text-highlighted shadow-xs' : 'text-muted hover:text-default'"
        >
          <UIcon
            :name="tab.icon"
            class="hidden size-4 sm:block"
          />
          <span class="sm:hidden">{{ tab.short }}</span>
          <span class="hidden sm:inline">{{ tab.label }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
