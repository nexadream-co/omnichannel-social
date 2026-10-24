<script setup lang="ts">
const props = defineProps<{ audience: 'creator' | 'staff' }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const notifications = useNotifications(props.audience)
notifications.startPolling()
const { actionLabel, open } = useNotificationActions(props.audience)
const undo = useUndoToast()
const groups = computed(() => collapseNotifications(notifications.items.value))

const LEVEL_COLOR = { info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' } as const
const allPath = computed(() => props.audience === 'creator' ? localePath('/app/notifications') : '/admin/notifications')

function markAll() {
  let restore = () => {}
  return undo.run({
    title: t('notifications.allRead'),
    apply: () => {
      restore = notifications.readAllLocally()
    },
    rollback: () => restore(),
    commit: () => notifications.commitReadAll()
  })
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
            @click="markAll"
          />
        </div>
        <ul
          v-if="notifications.items.value.length"
          class="max-h-96 overflow-y-auto divide-y divide-default"
        >
          <li
            v-for="group in groups"
            :key="group.key"
          >
            <div
              role="button"
              tabindex="0"
              class="w-full text-left px-4 py-3 flex gap-3 cursor-pointer hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
              @click="open(group)"
              @keydown.enter="open(group)"
            >
              <UIcon
                :name="group.item.icon || 'i-lucide-bell'"
                class="size-5 shrink-0 mt-0.5"
                :class="LEVEL_COLOR[group.item.level] ?? 'text-muted'"
              />
              <span class="min-w-0 flex-1">
                <span
                  class="flex items-center gap-1.5 text-sm"
                  :class="group.unreadIds.length ? 'text-highlighted font-medium' : 'text-muted'"
                >
                  <span class="min-w-0">{{ group.item.title }}</span>
                  <UBadge
                    v-if="group.count > 1"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    :label="`${group.count}×`"
                  />
                </span>
                <span
                  v-if="group.item.body"
                  class="block text-xs text-muted line-clamp-2"
                >{{ group.item.body }}</span>
                <span class="block text-xs text-dimmed mt-1">{{ formatRelative(group.item.createdAt, locale) }}</span>
                <UButton
                  v-if="group.item.actionUrl"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  class="mt-2"
                  :label="actionLabel(group.item)"
                  @click.stop="open(group)"
                />
              </span>
              <Transition
                leave-active-class="motion-safe:transition-transform motion-safe:duration-200"
                leave-to-class="scale-0"
              >
                <span
                  v-if="group.unreadIds.length"
                  class="size-2 rounded-full bg-primary mt-2 shrink-0"
                />
              </Transition>
            </div>
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
