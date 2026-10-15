<script setup lang="ts">
const props = defineProps<{ audience: 'creator' | 'staff' }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const bell = useNotifications(props.audience)
const unreadOnly = ref(false)
const filters = computed(() => ({ unreadOnly: unreadOnly.value ? 'true' : undefined }))
const list = useServerList<NotificationItem>(bell.base, { filters })
onMounted(list.refresh)

const LEVEL_COLOR = { info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' } as const

async function open(item: NotificationItem) {
  await bell.markRead(item.id)
  item.readAt ??= new Date().toISOString()
  if (item.actionUrl) await navigateTo(props.audience === 'creator' && item.actionUrl.startsWith('/app') ? localePath(item.actionUrl) : item.actionUrl)
}

async function markAll() {
  await bell.markAllRead()
  await list.refresh()
}
</script>

<template>
  <div class="w-full max-w-3xl mx-auto">
    <CommandBar :title="t('notifications.title')">
      <UButton
        v-if="bell.unreadCount.value"
        variant="outline"
        icon="i-lucide-check-check"
        :label="t('notifications.markAllRead')"
        @click="markAll"
      />
    </CommandBar>
    <div class="flex flex-wrap gap-3 items-center mb-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        :placeholder="t('common.search')"
        class="flex-1 min-w-48"
      />
      <USwitch
        v-model="unreadOnly"
        :label="t('notifications.unreadOnly')"
      />
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div
        v-if="list.status.value === 'loading' && !list.items.value.length"
        class="p-6 space-y-3"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-12 w-full"
        />
      </div>
      <p
        v-else-if="!list.items.value.length"
        class="p-10 text-center text-muted"
      >
        {{ unreadOnly ? t('notifications.emptyUnread') : t('notifications.empty') }}
      </p>
      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="item in list.items.value"
          :key="item.id"
        >
          <button
            type="button"
            class="w-full text-left px-4 py-4 flex gap-3 hover:bg-elevated/50"
            @click="open(item)"
          >
            <UIcon
              :name="item.icon || 'i-lucide-bell'"
              class="size-5 shrink-0 mt-0.5"
              :class="LEVEL_COLOR[item.level] ?? 'text-muted'"
            />
            <span class="min-w-0 flex-1">
              <span
                class="block"
                :class="item.readAt ? 'text-muted' : 'text-highlighted font-medium'"
              >{{ item.title }}</span>
              <span
                v-if="item.body"
                class="block text-sm text-muted"
              >{{ item.body }}</span>
              <span class="block text-xs text-dimmed mt-1">{{ formatDateTime(item.createdAt, { locale }) }}</span>
            </span>
            <span
              v-if="!item.readAt"
              class="size-2 rounded-full bg-primary mt-2 shrink-0"
            />
          </button>
        </li>
      </ul>
    </UCard>
    <div
      v-if="list.pageCount.value > 1"
      class="flex justify-center mt-4"
    >
      <UPagination
        v-model:page="list.page.value"
        :total="list.total.value"
        :items-per-page="list.limit.value"
      />
    </div>
  </div>
</template>
