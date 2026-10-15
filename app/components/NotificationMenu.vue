<script setup lang="ts">
const props = defineProps<{ audience: 'creator' | 'staff' }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const notifications = useNotifications(props.audience)
notifications.startPolling()

const LEVEL_COLOR = { info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' } as const
const allPath = computed(() => props.audience === 'creator' ? localePath('/app/notifications') : '/admin/notifications')

async function open(item: NotificationItem) {
  await notifications.markRead(item.id)
  if (item.actionUrl) await navigateTo(props.audience === 'creator' && item.actionUrl.startsWith('/app') ? localePath(item.actionUrl) : item.actionUrl)
}
</script>

<template>
  <UPopover :content="{ align: 'end', collisionPadding: 12 }">
    <UChip
      :show="notifications.unreadCount.value > 0"
      :text="notifications.unreadCount.value > 9 ? '9+' : notifications.unreadCount.value"
      size="2xl"
      color="error"
      inset
    >
      <UButton
        icon="i-lucide-bell"
        color="neutral"
        variant="ghost"
        square
        :aria-label="t('notifications.title')"
      />
    </UChip>
    <template #content>
      <div class="w-80 max-w-[calc(100vw-24px)]">
        <div class="flex items-center justify-between px-4 py-3 border-b border-default">
          <p class="font-semibold text-highlighted">
            {{ t('notifications.title') }}
          </p>
          <UButton
            v-if="notifications.unreadCount.value"
            size="xs"
            variant="link"
            :label="t('notifications.markAllRead')"
            @click="notifications.markAllRead()"
          />
        </div>
        <ul
          v-if="notifications.items.value.length"
          class="max-h-96 overflow-y-auto divide-y divide-default"
        >
          <li
            v-for="item in notifications.items.value"
            :key="item.id"
          >
            <button
              type="button"
              class="w-full text-left px-4 py-3 flex gap-3 hover:bg-elevated/50"
              @click="open(item)"
            >
              <UIcon
                :name="item.icon || 'i-lucide-bell'"
                class="size-5 shrink-0 mt-0.5"
                :class="LEVEL_COLOR[item.level] ?? 'text-muted'"
              />
              <span class="min-w-0 flex-1">
                <span
                  class="block text-sm"
                  :class="item.readAt ? 'text-muted' : 'text-highlighted font-medium'"
                >{{ item.title }}</span>
                <span
                  v-if="item.body"
                  class="block text-xs text-muted line-clamp-2"
                >{{ item.body }}</span>
                <span class="block text-xs text-dimmed mt-1">{{ formatRelative(item.createdAt, locale) }}</span>
              </span>
              <span
                v-if="!item.readAt"
                class="size-2 rounded-full bg-primary mt-2 shrink-0"
              />
            </button>
          </li>
        </ul>
        <p
          v-else
          class="px-4 py-8 text-center text-sm text-muted"
        >
          {{ t('notifications.empty') }}
        </p>
        <div class="border-t border-default p-2">
          <UButton
            :to="allPath"
            block
            variant="ghost"
            color="neutral"
            :label="t('notifications.seeAll')"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
