<script setup lang="ts">
const props = defineProps<{ audience: 'creator' | 'staff' }>()
const { t, locale } = useI18n()
const bell = useNotifications(props.audience)
const { actionLabel, open } = useNotificationActions(props.audience)
const undo = useUndoToast()
const unreadOnly = ref(false)
const filters = computed(() => ({ unreadOnly: unreadOnly.value ? 'true' : undefined }))
const list = useServerList<NotificationItem>(bell.base, { filters })
onMounted(list.refresh)

const LEVEL_COLOR = { info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' } as const
const BUCKETS: NotificationBucket[] = ['today', 'week', 'older']

const sections = computed(() => {
  const groups = collapseNotifications(list.items.value)
  return BUCKETS
    .map(bucket => ({ bucket, groups: groups.filter(group => notificationBucket(group.item.createdAt) === bucket) }))
    .filter(section => section.groups.length)
})

function markLocal(ids: string[]) {
  const stamp = new Date().toISOString()
  for (const item of list.items.value) if (ids.includes(item.id)) item.readAt ??= stamp
}

function markAll() {
  const readAt = new Map(list.items.value.map(item => [item.id, item.readAt]))
  let restoreBell = () => {}
  return undo.run({
    title: t('notifications.allRead'),
    apply: () => {
      restoreBell = bell.readAllLocally()
      markLocal([...readAt.keys()])
    },
    rollback: () => {
      restoreBell()
      for (const item of list.items.value) item.readAt = readAt.get(item.id) ?? null
    },
    commit: async () => {
      await bell.commitReadAll()
      if (unreadOnly.value) await list.refresh()
    }
  })
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
    <UCard
      v-if="list.status.value === 'loading' && !list.items.value.length"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <div class="p-6 space-y-3">
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-12 w-full"
        />
      </div>
    </UCard>
    <UCard
      v-else-if="!list.items.value.length"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <EmptyState
        v-if="list.search.value"
        icon="i-lucide-search-x"
        :title="t('notifications.noMatch')"
      />
      <EmptyState
        v-else
        tone="happy"
        icon="i-lucide-party-popper"
        :title="t('notifications.emptyTitle')"
        :description="t('notifications.emptyBody')"
      />
    </UCard>
    <div
      v-else
      class="space-y-5"
    >
      <section
        v-for="section in sections"
        :key="section.bucket"
        class="space-y-2"
      >
        <h2 class="text-xs font-semibold uppercase tracking-wide text-muted px-1">
          {{ t(`notifications.bucket.${section.bucket}`) }}
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <TransitionGroup
            name="list"
            tag="ul"
            class="divide-y divide-default"
          >
            <li
              v-for="group in section.groups"
              :key="group.key"
              class="flex flex-wrap sm:flex-nowrap items-center gap-x-2 pr-3 hover:bg-elevated/50"
            >
              <button
                type="button"
                class="min-w-0 flex-1 text-left pl-4 pr-1 py-4 flex gap-3 focus-visible:outline-2 focus-visible:outline-primary"
                @click="open(group, markLocal)"
              >
                <UIcon
                  :name="group.item.icon || 'i-lucide-bell'"
                  class="size-5 shrink-0 mt-0.5"
                  :class="LEVEL_COLOR[group.item.level] ?? 'text-muted'"
                />
                <span class="min-w-0 flex-1">
                  <span
                    class="flex items-center gap-2"
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
                    class="block text-sm text-muted"
                  >{{ group.item.body }}</span>
                  <span class="block text-xs text-dimmed mt-1">{{ formatDateTime(group.item.createdAt, { locale }) }}</span>
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
              </button>
              <div
                v-if="group.item.actionUrl"
                class="shrink-0 max-sm:basis-full max-sm:pl-12 max-sm:pb-3"
              >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :label="actionLabel(group.item)"
                  @click.stop="open(group, markLocal)"
                />
              </div>
            </li>
          </TransitionGroup>
        </UCard>
      </section>
    </div>
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
