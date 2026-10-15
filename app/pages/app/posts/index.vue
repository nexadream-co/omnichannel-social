<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { POST_STATUS_META, POST_TARGET_STATUS_META } from '#shared/utils/status'

interface PostRow {
  id: string
  caption: string
  status: string
  scheduledAt: string | null
  createdAt: string
  thumbnail: { url: string | null, kind: 'image' | 'video' } | null
  targets: { id: string, platform: Platform, status: string, username: string | null, errorCode: string | null }[]
}

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
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
const filters = computed(() => ({ tab: tab.value }))
const list = useServerList<PostRow>('/api/app/posts', { filters })
onMounted(list.refresh)

const tz = computed(() => auth.profile.value?.displayTimezone)
const canWrite = computed(() => auth.hasAbility('posts.write'))
const tabs = computed(() => TABS.map(value => ({ value, label: t(`posts.tabs.${value}`) })))

async function act(fn: () => Promise<unknown>, success: string) {
  try {
    await fn()
    toast.add({ title: success, color: 'success' })
    await list.refresh()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}

async function cancel(post: PostRow) {
  if (!(await confirm({ title: t('posts.cancelConfirm'), color: 'error', confirmLabel: t('posts.cancel') }))) return
  await act(() => apiFetch(`/api/app/posts/${post.id}/cancel`, { method: 'POST' }), t('posts.cancelled'))
}

async function retry(targetId: string) {
  await act(() => apiFetch(`/api/app/post-targets/${targetId}/retry`, { method: 'POST' }), t('posts.retried'))
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
      v-if="list.status.value === 'loading' && !list.items.value.length"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 4"
        :key="n"
        class="h-24 w-full"
      />
    </div>
    <UCard
      v-else-if="!list.items.value.length"
      class="text-center"
    >
      <UIcon
        :name="tab === 'failed' ? 'i-lucide-circle-check' : 'i-lucide-calendar-plus'"
        class="size-8 text-muted mx-auto"
      />
      <p class="mt-3 text-default">
        {{ t(`posts.empty.${tab}`) }}
      </p>
      <UButton
        v-if="canWrite && tab !== 'failed'"
        :to="localePath('/app/compose')"
        :label="t('posts.create')"
        class="mt-4"
      />
    </UCard>
    <ul
      v-else
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
              class="shrink-0 size-16 rounded-md overflow-hidden bg-elevated flex items-center justify-center"
            >
              <img
                v-if="post.thumbnail?.url && post.thumbnail.kind === 'image'"
                :src="post.thumbnail.url"
                alt=""
                class="size-full object-cover"
              >
              <UIcon
                v-else
                :name="post.thumbnail?.kind === 'video' ? 'i-lucide-video' : 'i-lucide-text'"
                class="size-6 text-muted"
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
              <p class="text-xs text-muted">
                <StatusBadge
                  :value="post.status"
                  :meta="POST_STATUS_META"
                />
                <span
                  v-if="post.scheduledAt"
                  class="ml-2"
                >{{ formatDateTime(post.scheduledAt, { locale, timeZone: tz }) }}</span>
              </p>
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
                  <StatusBadge
                    :value="target.status"
                    :meta="POST_TARGET_STATUS_META"
                  />
                  <UButton
                    v-if="canWrite && target.status === 'failed'"
                    size="xs"
                    variant="link"
                    :label="t('posts.retry')"
                    class="px-1"
                    @click="retry(target.id)"
                  />
                </span>
              </div>
            </div>
          </div>
        </UCard>
      </li>
    </ul>
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
