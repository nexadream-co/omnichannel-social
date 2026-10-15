<script setup lang="ts">
import { DM_EVENT_STATUS_KEYS, type DmEventStatus } from '#shared/utils/autoreply'

interface ActivityRow {
  id: string
  ruleId: string | null
  ruleName: string | null
  commenterUsername: string | null
  commentText: string | null
  status: DmEventStatus
  error: string | null
  createdAt: string
}

definePageMeta({ layout: 'creator' })
const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
useHead({ title: () => t('autoReply.activityTitle') })

const status = ref<'all' | 'sent' | 'skipped'>('all')
const page = ref(1)
const data = ref<{ items: ActivityRow[], meta: { page: number, limit: number, total: number, pageCount: number }, dmClicks30d: number } | null>(null)
const ruleId = computed(() => typeof route.query.rule === 'string' ? route.query.rule : undefined)
async function load() {
  data.value = await apiFetch('/api/app/autoreply/activity', { query: { page: page.value, limit: 25, status: status.value, ruleId: ruleId.value } })
}
onMounted(load)
watch([status, ruleId], () => {
  page.value = 1
  void load()
})
watch(page, load)

const tabs = computed(() => (['all', 'sent', 'skipped'] as const).map(value => ({ value, label: t(`autoReply.filter.${value}`) })))
const color = (s: DmEventStatus) => s === 'dm_sent' || s === 'replied' ? 'success' : s === 'failed' ? 'error' : s === 'matched' ? 'info' : 'neutral'
/** Error codes like "rejected:190" map to their family's plain-Bahasa reason. */
function reason(row: ActivityRow) {
  if (!row.error) return null
  const key = `autoReply.reason.${row.error.split(':')[0]}`
  return te(key) ? t(key) : t('autoReply.reason.rejected')
}
</script>

<template>
  <div class="w-full max-w-4xl mx-auto space-y-4">
    <CommandBar
      :title="t('autoReply.activityTitle')"
      :description="t('autoReply.activitySubtitle')"
    >
      <UButton
        :to="localePath('/app/auto-reply')"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        :label="t('autoReply.title')"
      />
    </CommandBar>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UTabs
        v-model="status"
        :items="tabs"
        :content="false"
        size="sm"
      />
      <p
        v-if="data"
        class="text-sm text-muted flex items-center gap-1.5"
      >
        <UIcon
          name="i-lucide-mouse-pointer-click"
          class="size-4"
        />
        {{ t('autoReply.dmClicks', { n: data.dmClicks30d }) }}
      </p>
    </div>

    <div
      v-if="!data"
      class="space-y-2"
    >
      <USkeleton
        v-for="n in 5"
        :key="n"
        class="h-16 w-full"
      />
    </div>
    <UCard
      v-else-if="!data.items.length"
      class="text-center"
    >
      <UIcon
        name="i-lucide-inbox"
        class="size-8 text-muted mx-auto"
      />
      <p class="mt-3 text-muted">
        {{ t('autoReply.activityEmpty') }}
      </p>
    </UCard>
    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="row in data.items"
          :key="row.id"
          class="p-3 sm:p-4 flex gap-3"
        >
          <UAvatar
            :alt="row.commenterUsername ?? '?'"
            size="sm"
            class="shrink-0"
          />
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-sm font-medium text-highlighted truncate">@{{ row.commenterUsername ?? '—' }}</span>
              <span class="text-xs text-muted shrink-0">{{ formatRelative(row.createdAt, locale) }}</span>
            </div>
            <UBadge
              :color="color(row.status)"
              variant="subtle"
              size="sm"
              :label="t(DM_EVENT_STATUS_KEYS[row.status])"
            />
            <p
              v-if="row.commentText"
              class="text-sm text-default break-words"
            >
              “{{ row.commentText }}”
            </p>
            <p
              v-if="reason(row)"
              class="text-xs text-muted"
            >
              {{ reason(row) }}
            </p>
            <p class="text-xs text-dimmed">
              {{ row.ruleName ?? t('autoReply.deletedRule') }}
            </p>
          </div>
        </li>
      </ul>
    </UCard>
    <div
      v-if="data && data.meta.pageCount > 1"
      class="flex justify-center"
    >
      <UPagination
        v-model:page="page"
        :total="data.meta.total"
        :items-per-page="data.meta.limit"
      />
    </div>
  </div>
</template>
