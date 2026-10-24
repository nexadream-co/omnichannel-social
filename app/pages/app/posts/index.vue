<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { POST_STATUS_META, POST_TARGET_STATUS_META } from '#shared/utils/status'
import { useIntervalFn, useTimeoutFn } from '@vueuse/core'
import type { OverduePost } from '~/components/OverduePostCard.vue'

interface PostRow {
  id: string
  caption: string
  status: string
  overdue: boolean
  scheduledAt: string | null
  createdAt: string
  thumbnail: { url: string | null, kind: 'image' | 'video' } | null
  targets: { id: string, platform: Platform, status: string, removedAt: string | null, editedAt: string | null, username: string | null, errorCode: string | null, socialAccountId: string, accountStatus: string }[]
}
interface Counts { scheduled: number, overdue: number, draft: number, published: number, failed: number }

definePageMeta({ layout: 'creator' })
const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useCreatorAuth()
const { confirm } = useConfirmDialog()
useHead({ title: () => t('posts.title') })

const TABS = ['scheduled', 'draft', 'published', 'failed', 'all'] as const
type Tab = typeof TABS[number]
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? route.query.tab as Tab : 'scheduled')
watch(tab, value => router.replace({ query: { tab: value } }))
// Scheduled: what is overdue sits in its own section above, so the list below is only what still waits.
const filters = computed(() => tab.value === 'scheduled' ? { tab: tab.value, due: 'upcoming' } : { tab: tab.value })
const list = useServerList<PostRow>('/api/app/posts', { filters })
onMounted(list.refresh)

const counts = ref<Counts | null>(null)
const overdue = ref<OverduePost[]>([])
// The section starts with the first 20; "Lihat semua" pages through the rest (the list below only holds upcoming posts).
const showAllOverdue = ref(false)
async function loadSide() {
  counts.value = await apiFetch<Counts>('/api/app/posts/counts').catch(() => counts.value)
  if (!counts.value?.overdue) {
    overdue.value = []
    return
  }
  const limit = showAllOverdue.value ? 100 : 20
  const items: OverduePost[] = []
  for (let page = 1; ; page++) {
    const response = await apiFetch<{ items: OverduePost[], meta: { pageCount: number } }>('/api/app/posts', { query: { tab: 'scheduled', due: 'overdue', limit, page } }).catch(() => null)
    if (!response) break
    items.push(...response.items)
    if (!showAllOverdue.value || page >= response.meta.pageCount) break
  }
  overdue.value = items
}
onMounted(loadSide)
const stopMutation = onApiMutation(changed => (changed === '/api/app/posts' || changed === '/api/app/post-targets') && loadSide())
onScopeDispose(stopMutation)

const tz = computed(() => auth.profile.value?.displayTimezone)
const canWrite = computed(() => auth.hasAbility('posts.write'))
const COUNTED: Partial<Record<Tab, keyof Counts>> = { scheduled: 'scheduled', draft: 'draft', failed: 'failed' }
const tabs = computed(() => TABS.map((value) => {
  const key = COUNTED[value]
  const n = key ? counts.value?.[key] ?? 0 : 0
  return { value, label: n ? t('posts.tabCount', { label: t(`posts.tabs.${value}`), n }) : t(`posts.tabs.${value}`) }
}))

// Publishing is checked again every 15 s while anything on screen is on its way out; nothing runs otherwise.
const publishing = computed(() => list.items.value.some(post => post.status === 'publishing'))
const poll = useIntervalFn(() => void list.refresh(), 15_000, { immediate: false })
watch(publishing, busy => busy ? poll.resume() : poll.pause(), { immediate: true })

// A post that was on its way and is now out gets a brief "Terbit ✓".
const justPublished = ref(new Set<string>())
watch(list.items, (next, prev) => {
  const was = new Set(prev.filter(post => post.status === 'publishing').map(post => post.id))
  for (const post of next) {
    if (!was.has(post.id) || !['published', 'partial'].includes(post.status)) continue
    justPublished.value = new Set([...justPublished.value, post.id])
    setTimeout(() => {
      justPublished.value = new Set([...justPublished.value].filter(id => id !== post.id))
    }, 1200)
  }
})

async function act(fn: () => Promise<unknown>, success: string) {
  try {
    await fn()
    toast.add({ title: success, color: 'success' })
    await list.refresh()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}

const undo = useUndoToast()
async function cancel(post: PostRow) {
  const original = post.scheduledAt
  // Far enough ahead: cancel at once and offer "Urungkan". Close to its time there is no safe way back, so ask first.
  if (original && new Date(original).getTime() - Date.now() > 120_000) {
    await undo.run({
      title: t('posts.cancelledUndo'),
      apply: () => {
        list.items.value = list.items.value.filter(item => item.id !== post.id)
      },
      rollback: () => void list.refresh(),
      commit: () => apiFetch(`/api/app/posts/${post.id}/cancel`, { method: 'POST' }),
      undo: async () => {
        await apiFetch(`/api/app/posts/${post.id}/reschedule`, { method: 'POST', body: { scheduledAt: original } })
        await list.refresh()
      }
    })
    return
  }
  if (!(await confirm({ title: t('posts.cancelConfirm'), color: 'error', confirmLabel: t('posts.cancel') }))) return
  await act(() => apiFetch(`/api/app/posts/${post.id}/cancel`, { method: 'POST' }), t('posts.cancelled'))
}

const retrying = ref<string | null>(null)
async function retry(targetId: string) {
  retrying.value = targetId
  await act(() => apiFetch(`/api/app/post-targets/${targetId}/retry`, { method: 'POST' }), t('posts.retried'))
  retrying.value = null
}

// "Sinkronkan" on Terbit / Semua: one background run for the workspace (numbers, caption edits, deletion; nightly at 02:00 WIB).
const showSync = computed(() => tab.value === 'published' || tab.value === 'all')
const syncing = ref(false)
const afterSync = useTimeoutFn(() => void list.refresh(), 10_000, { immediate: false })
async function sync() {
  syncing.value = true
  try {
    await apiFetch('/api/app/posts/sync', { method: 'POST' })
    toast.add({ title: t('posts.syncStarted'), color: 'success' })
    afterSync.start()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    syncing.value = false
  }
}

/** The latest caption edit found on a platform, shown under the caption. */
function lastEdit(post: PostRow) {
  const edited = post.targets.filter(t => t.editedAt).sort((a, b) => b.editedAt!.localeCompare(a.editedAt!))[0]
  return edited ? t('posts.editedOn', { platform: PLATFORM_META[edited.platform].name, date: formatDateTime(edited.editedAt!, { locale: locale.value, timeZone: tz.value }) }) : null
}

function menu(post: PostRow) {
  const items = [[{ label: t('posts.detail'), icon: 'i-lucide-eye', to: localePath(`/app/posts/${post.id}`) }]]
  if (canWrite.value) {
    const editable = ['draft', 'scheduled'].includes(post.status)
    items.push([
      ...(editable ? [{ label: t('posts.edit'), icon: 'i-lucide-pencil', to: localePath({ path: '/app/compose', query: { post: post.id } }) }] : []),
      { label: t('posts.duplicate'), icon: 'i-lucide-copy', to: localePath({ path: '/app/compose', query: { duplicate: post.id } }) },
      ...(post.status === 'scheduled' ? [{ label: t('posts.cancel'), icon: 'i-lucide-circle-x', onSelect: () => cancel(post) } as never] : [])
    ])
  }
  return items
}
</script>

<template>
  <div class="w-full max-w-3xl mx-auto">
    <CommandBar
      :title="t('posts.title')"
      :description="t('posts.subtitle')"
    >
      <UButton
        v-if="canWrite"
        :to="localePath('/app/compose')"
        icon="i-lucide-plus"
        :label="t('posts.create')"
        class="hidden sm:inline-flex"
      />
    </CommandBar>
    <div class="overflow-x-auto -mx-4 px-4 mb-4">
      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
        size="sm"
      />
    </div>
    <div
      v-if="showSync"
      class="flex items-start justify-between gap-3 mb-4"
    >
      <p class="text-xs text-muted">
        {{ t('posts.syncHint') }}
      </p>
      <UButton
        icon="i-lucide-refresh-cw"
        size="sm"
        color="neutral"
        variant="outline"
        :loading="syncing"
        :label="t('posts.sync')"
        class="shrink-0"
        @click="sync"
      />
    </div>

    <div
      v-if="tab === 'scheduled' && overdue.length"
      class="mb-5 space-y-2"
    >
      <h2 class="text-sm font-semibold text-highlighted">
        {{ t('posts.needsAction') }}
      </h2>
      <TransitionGroup
        name="list"
        tag="div"
        class="space-y-2"
      >
        <OverduePostCard
          v-for="post in overdue"
          :key="post.id"
          :post="post"
          @changed="() => { loadSide(); list.refresh() }"
        />
      </TransitionGroup>
      <UButton
        v-if="!showAllOverdue && (counts?.overdue ?? 0) > overdue.length"
        variant="link"
        color="neutral"
        :label="t('posts.overdueAll', { n: counts?.overdue ?? 0 })"
        @click="() => { showAllOverdue = true; loadSide() }"
      />
    </div>

    <div
      v-if="list.status.value === 'loading' && !list.items.value.length"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 4"
        :key="n"
        class="h-24 w-full"
      />
    </div>
    <template v-else-if="!list.items.value.length">
      <EmptyState
        v-if="!(tab === 'scheduled' && overdue.length)"
        :icon="tab === 'failed' ? 'i-lucide-circle-check' : tab === 'draft' ? 'i-lucide-file-pen-line' : tab === 'published' ? 'i-lucide-send' : 'i-lucide-calendar-plus'"
        :tone="tab === 'failed' ? 'happy' : 'default'"
        :title="t(`posts.emptyState.${tab}.title`)"
        :description="te(`posts.emptyState.${tab}.description`) ? t(`posts.emptyState.${tab}.description`) : undefined"
        :action="canWrite && tab !== 'failed' ? { label: t('posts.create'), to: localePath('/app/compose'), icon: 'i-lucide-plus' } : undefined"
      />
    </template>
    <TransitionGroup
      v-else
      name="list"
      tag="ul"
      class="space-y-3"
    >
      <li
        v-for="post in list.items.value"
        :key="post.id"
      >
        <UCard :ui="{ body: 'p-3 sm:p-4' }">
          <div class="flex gap-3">
            <NuxtLink
              :to="localePath(`/app/posts/${post.id}`)"
              class="shrink-0"
              :aria-label="t('posts.detail')"
            >
              <SmartImage
                :src="post.thumbnail?.kind === 'image' ? post.thumbnail.url : null"
                kind="post"
                :title="post.caption"
                class="size-16 rounded-md bg-elevated"
              />
            </NuxtLink>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex items-start justify-between gap-2">
                <NuxtLink
                  :to="localePath(`/app/posts/${post.id}`)"
                  class="text-sm text-highlighted line-clamp-2 break-words"
                >
                  {{ post.caption || t('posts.noCaption') }}
                </NuxtLink>
                <UDropdownMenu
                  :items="menu(post)"
                  :content="{ align: 'end' }"
                >
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :aria-label="t('posts.detail')"
                  />
                </UDropdownMenu>
              </div>
              <p
                v-if="lastEdit(post)"
                class="text-xs text-muted"
              >
                <UIcon
                  name="i-lucide-pencil-line"
                  class="size-3 align-[-2px]"
                />
                {{ lastEdit(post) }}
              </p>
              <p class="text-xs text-muted">
                <UBadge
                  v-if="justPublished.has(post.id)"
                  color="success"
                  variant="subtle"
                  icon="i-lucide-check"
                  :label="t('posts.publishedDone')"
                  class="animate-nav-pop"
                />
                <StatusBadge
                  v-else
                  :value="post.overdue ? 'overdue' : post.status"
                  :meta="POST_STATUS_META"
                />
                <span
                  v-if="post.scheduledAt"
                  class="ml-2"
                >{{ formatDateTime(post.scheduledAt, { locale, timeZone: tz }) }}</span>
              </p>
              <UProgress
                v-if="post.status === 'publishing'"
                size="2xs"
                color="warning"
                :aria-label="t('busy.publishing')"
              />
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="target in post.targets"
                  :key="target.id"
                  class="inline-flex items-center gap-1 text-xs rounded-full bg-elevated px-2 py-0.5"
                >
                  <UIcon
                    :name="PLATFORM_META[target.platform].icon"
                    class="size-3.5"
                  />
                  <span v-if="target.removedAt">{{ t('posts.removedOn', { platform: PLATFORM_META[target.platform].name }) }}</span>
                  <StatusBadge
                    v-else
                    :value="target.status"
                    :meta="POST_TARGET_STATUS_META"
                  />
                  <UButton
                    v-if="canWrite && (target.status === 'failed' || (post.overdue && target.status === 'scheduled' && target.accountStatus === 'active'))"
                    size="xs"
                    variant="link"
                    :label="retrying === target.id ? t('busy.publishing') : target.status === 'failed' ? t('posts.retry') : t('posts.publishNow')"
                    :loading="retrying === target.id"
                    class="px-1"
                    @click="retry(target.id)"
                  />
                </span>
              </div>
            </div>
          </div>
        </UCard>
      </li>
    </TransitionGroup>
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
