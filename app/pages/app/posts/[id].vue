<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform, PostFormat } from '#shared/channels/types'
import { POST_STATUS_META, POST_TARGET_STATUS_META, PUBLISH_ERROR_LABELS } from '#shared/utils/status'

interface Detail {
  id: string
  caption: string
  status: string
  scheduledAt: string | null
  media: { id: string, kind: 'image' | 'video', url: string | null }[]
  targets: { id: string, platform: Platform, format: PostFormat, username: string | null, avatarUrl: string | null, accountStatus: string, status: string, scheduledAt: string | null, publishedAt: string | null, permalink: string | null, errorCode: string | null, insights: { metrics: Record<string, number>, capturedAt: string } | null, clicks: number, autoReplies: number }[]
}

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
const auth = useCreatorAuth()
const { confirm } = useConfirmDialog()
const id = String(route.params.id)
useHead({ title: () => t('posts.detail') })

const post = ref<Detail | null>(null)
async function load() {
  post.value = await apiFetch<Detail>(`/api/app/posts/${id}`)
}
onMounted(load)

// While anything is in flight, keep the page fresh without a manual reload.
type Target = Detail['targets'][number]
/** Views/likes/comments come from the platform once a day; clicks and auto-replies are ours, live. */
function statsFor(target: Target) {
  const m = target.insights?.metrics ?? {}
  const pick = (...keys: string[]) => (target.insights ? keys.reduce<number | null>((found, k) => found ?? (typeof m[k] === 'number' ? m[k] : null), null) : null)
  return [
    { key: 'views', value: pick('views', 'impressions') },
    { key: 'likes', value: pick('likes', 'reactions') },
    { key: 'comments', value: pick('comments', 'replies') },
    { key: 'clicks', value: target.clicks },
    ...(target.platform === 'instagram' ? [{ key: 'autoReplies', value: target.autoReplies }] : [])
  ]
}
const inFlight = computed(() => post.value?.status === 'publishing' || post.value?.targets.some(t => ['preparing', 'processing', 'publishing', 'publish_unknown', 'retrying'].includes(t.status)))
let timer: ReturnType<typeof setInterval> | undefined
watch(inFlight, (busy) => {
  clearInterval(timer)
  if (busy) timer = setInterval(load, 4000)
})
onBeforeUnmount(() => clearInterval(timer))

const tz = computed(() => auth.profile.value?.displayTimezone)
const canWrite = computed(() => auth.hasAbility('posts.write'))
const editable = computed(() => post.value && ['draft', 'scheduled'].includes(post.value.status))

async function retry(targetId: string) {
  try {
    await apiFetch(`/api/app/post-targets/${targetId}/retry`, { method: 'POST' })
    toast.add({ title: t('posts.retried'), color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}

async function cancel() {
  if (!(await confirm({ title: t('posts.cancelConfirm'), color: 'error', confirmLabel: t('posts.cancel') }))) return
  await apiFetch(`/api/app/posts/${id}/cancel`, { method: 'POST' })
  toast.add({ title: t('posts.cancelled'), color: 'success' })
  await load()
}

async function remove() {
  if (!(await confirm({ title: t('posts.deleteConfirm'), color: 'error', confirmLabel: t('posts.delete') }))) return
  try {
    await apiFetch(`/api/app/posts/${id}`, { method: 'DELETE' })
    toast.add({ title: t('posts.deleted'), color: 'success' })
    await navigateTo(localePath('/app/posts'))
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}
</script>

<template>
  <div class="w-full max-w-3xl mx-auto">
    <CommandBar :title="t('posts.detail')">
      <template v-if="post && canWrite">
        <UButton
          v-if="editable"
          :to="localePath({ path: '/app/compose', query: { post: id } })"
          icon="i-lucide-pencil"
          variant="outline"
          :label="t('posts.edit')"
        />
        <UButton
          :to="localePath({ path: '/app/compose', query: { duplicate: id } })"
          icon="i-lucide-copy"
          color="neutral"
          variant="outline"
          :label="t('posts.duplicate')"
        />
      </template>
    </CommandBar>
    <div
      v-if="!post"
      class="space-y-3"
    >
      <USkeleton class="h-40 w-full" />
      <USkeleton class="h-32 w-full" />
    </div>
    <div
      v-else
      class="space-y-5"
    >
      <UCard>
        <div class="flex items-center gap-2 mb-3">
          <StatusBadge
            :value="post.status"
            :meta="POST_STATUS_META"
          />
          <span
            v-if="post.scheduledAt && ['scheduled', 'draft'].includes(post.status)"
            class="text-sm text-muted"
          >{{ t('posts.scheduledFor', { date: formatDateTime(post.scheduledAt, { locale, timeZone: tz }) }) }}</span>
        </div>
        <div
          v-if="post.media.length"
          class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3"
        >
          <div
            v-for="m in post.media"
            :key="m.id"
            class="aspect-square rounded-md overflow-hidden bg-elevated"
          >
            <img
              v-if="m.kind === 'image' && m.url"
              :src="m.url"
              alt=""
              class="size-full object-cover"
            >
            <video
              v-else-if="m.url"
              :src="m.url"
              class="size-full object-cover"
              controls
              playsinline
            />
          </div>
        </div>
        <p class="whitespace-pre-line break-words text-default">
          {{ post.caption || t('posts.noCaption') }}
        </p>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="font-semibold">
            {{ t('posts.perPlatform') }}
          </h2>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="target in post.targets"
            :key="target.id"
            class="px-4 py-3 space-y-2"
          >
            <div class="flex flex-wrap items-center gap-3">
              <UAvatar
                :src="target.avatarUrl ?? undefined"
                :icon="PLATFORM_META[target.platform].icon"
                size="sm"
              />
              <div class="min-w-0 flex-1">
                <p class="font-medium truncate">
                  {{ target.username || PLATFORM_META[target.platform].name }}
                </p>
                <p class="text-xs text-muted">
                  {{ PLATFORM_META[target.platform].name }} · {{ t(`format.${target.format}`) }}
                  <template v-if="target.publishedAt">
                    · {{ t('posts.publishedAt', { date: formatDateTime(target.publishedAt, { locale, timeZone: tz }) }) }}
                  </template>
                </p>
              </div>
              <StatusBadge
                :value="target.status"
                :meta="POST_TARGET_STATUS_META"
              />
            </div>
            <dl
              v-if="target.status === 'published'"
              class="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center"
            >
              <div
                v-for="stat in statsFor(target)"
                :key="stat.key"
                class="rounded-md bg-elevated/60 px-2 py-1.5"
              >
                <dt class="text-[11px] text-muted">
                  {{ t(`posts.metrics.${stat.key}`) }}
                </dt>
                <dd class="text-sm font-semibold text-highlighted">
                  {{ stat.value === null ? '—' : formatCompact(stat.value, locale) }}
                </dd>
              </div>
            </dl>
            <p
              v-if="target.status === 'published' && !target.insights"
              class="text-xs text-muted"
            >
              {{ t('posts.metrics.pending') }}
            </p>
            <UAlert
              v-if="target.errorCode && ['failed', 'needs_reauth', 'quota_deferred'].includes(target.status)"
              :color="target.status === 'failed' ? 'error' : 'warning'"
              variant="subtle"
              :title="t(PUBLISH_ERROR_LABELS[target.errorCode] ?? 'publishError.permanent')"
              :actions="target.status === 'needs_reauth'
                ? [{ label: t('posts.reconnect'), to: localePath('/app/accounts'), color: 'warning', variant: 'outline' }]
                : canWrite && target.status === 'failed' ? [{ label: t('posts.retry'), color: 'error', variant: 'outline', onClick: () => retry(target.id) }] : []"
            />
            <UButton
              v-if="target.permalink"
              :to="target.permalink"
              target="_blank"
              size="xs"
              variant="link"
              icon="i-lucide-external-link"
              :label="t('posts.view')"
              class="px-0"
            />
          </li>
        </ul>
      </UCard>

      <div
        v-if="canWrite"
        class="flex flex-wrap gap-2 justify-end"
      >
        <UButton
          v-if="post.status === 'scheduled'"
          color="error"
          variant="ghost"
          :label="t('posts.cancel')"
          @click="cancel"
        />
        <UButton
          v-if="!post.targets.some(t => ['published', 'preparing', 'processing', 'publishing', 'publish_unknown'].includes(t.status))"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          :label="t('posts.delete')"
          @click="remove"
        />
      </div>
    </div>
  </div>
</template>
