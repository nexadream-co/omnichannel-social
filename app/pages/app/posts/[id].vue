<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform, PostFormat } from '#shared/channels/types'
import { PILLAR_META, type ContentPillar } from '#shared/utils/planner'
import { isOverdue } from '#shared/utils/overdue'
import { POST_CHANGE_LABELS, POST_STATUS_META, POST_TARGET_STATUS_META, PUBLISH_ERROR_LABELS } from '#shared/utils/status'

interface Detail {
  id: string
  caption: string
  status: string
  scheduledAt: string | null
  pillar: ContentPillar | null
  idea: { id: string, title: string } | null
  media: { id: string, kind: 'image' | 'video', url: string | null }[]
  targets: { id: string, platform: Platform, format: PostFormat, username: string | null, avatarUrl: string | null, accountStatus: string, caption: string, status: string, scheduledAt: string | null, publishedAt: string | null, syncedAt: string | null, removedAt: string | null, permalink: string | null, errorCode: string | null, insights: { metrics: Record<string, number>, capturedAt: string } | null, clicks: number, autoReplies: number, changes: { kind: string, before: string | null, after: string | null, detectedAt: string }[] }[]
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
const checkPop = useCheckPop()
async function load() {
  const before = post.value?.status
  post.value = await apiFetch<Detail>(`/api/app/posts/${id}`)
  // Seen going from "on its way" to out: the badge says "Terbit ✓" for a moment.
  if (before === 'publishing' && ['published', 'partial'].includes(post.value.status)) checkPop.trigger()
}
onMounted(load)

// A scheduled post that missed its time: same card and button as on Beranda.
const overdue = computed(() => Boolean(post.value && isOverdue(post.value.status, post.value.scheduledAt)))
const overduePost = computed(() => post.value && {
  id: post.value.id,
  caption: post.value.caption,
  scheduledAt: post.value.scheduledAt,
  thumbnail: null,
  targets: post.value.targets.map(target => ({ id: target.id, platform: target.platform, status: target.status, accountStatus: target.accountStatus }))
})

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
// "Jadikan ide lagi": this post's words, media and products go back to Bank Ide for another round.
const planner = usePlanner()
const repeating = ref(false)
async function repeat() {
  repeating.value = true
  await planner.repeatPost(id)
  repeating.value = false
}
const editable = computed(() => post.value && ['draft', 'scheduled'].includes(post.value.status))

// "Sinkronkan": re-read the platform now (numbers, caption edits, deletion); the nightly run is at 02:00 WIB.
const canSync = computed(() => post.value?.targets.some(t => t.status === 'published'))
const syncing = ref(false)
async function sync() {
  syncing.value = true
  try {
    const result = await apiFetch<{ edited: number, removed: number, failed: number }>(`/api/app/posts/${id}/sync`, { method: 'POST' })
    const message = result.failed ? 'posts.syncPartial' : result.removed ? 'posts.syncedRemoved' : result.edited ? 'posts.syncedEdited' : 'posts.synced'
    toast.add({ title: t(message), color: result.failed ? 'warning' : 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    syncing.value = false
  }
}

const platformName = (target: Target) => PLATFORM_META[target.platform].name
const when = (iso: string) => formatDateTime(iso, { locale: locale.value, timeZone: tz.value })
/** The account's caption, shown only when the platform made it differ from the post's. */
const ownCaption = (target: Target) => target.status === 'published' && post.value && target.caption !== post.value.caption

const retrying = ref<string | null>(null)
async function retry(targetId: string) {
  retrying.value = targetId
  try {
    await apiFetch(`/api/app/post-targets/${targetId}/retry`, { method: 'POST' })
    toast.add({ title: t('posts.retried'), color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    retrying.value = null
  }
}

const undo = useUndoToast()
const cancelling = ref(false)
async function cancel() {
  const original = post.value?.scheduledAt
  cancelling.value = true
  try {
    // Far enough ahead: cancel at once with "Urungkan". Close to its time there is no safe way back, so ask first.
    if (original && new Date(original).getTime() - Date.now() > 120_000) {
      await undo.run({
        title: t('posts.cancelledUndo'),
        commit: async () => {
          await apiFetch(`/api/app/posts/${id}/cancel`, { method: 'POST' })
          await load()
        },
        undo: async () => {
          await apiFetch(`/api/app/posts/${id}/reschedule`, { method: 'POST', body: { scheduledAt: original } })
          await load()
        }
      })
      return
    }
    if (!(await confirm({ title: t('posts.cancelConfirm'), color: 'error', confirmLabel: t('posts.cancel') }))) return
    await apiFetch(`/api/app/posts/${id}/cancel`, { method: 'POST' })
    toast.add({ title: t('posts.cancelled'), color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    cancelling.value = false
  }
}

const removing = ref(false)
async function remove() {
  if (!(await confirm({ title: t('posts.deleteConfirm'), color: 'error', confirmLabel: t('posts.delete') }))) return
  removing.value = true
  try {
    await apiFetch(`/api/app/posts/${id}`, { method: 'DELETE' })
    toast.add({ title: t('posts.deleted'), color: 'success' })
    await navigateTo(localePath('/app/posts'))
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    removing.value = false
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
        <UButton
          icon="i-lucide-repeat"
          color="neutral"
          variant="outline"
          :label="t('planner.idea.repeat')"
          :loading="repeating"
          @click="repeat"
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
      <OverduePostCard
        v-if="overdue && overduePost"
        :post="overduePost"
        @changed="load"
      />

      <UCard>
        <div class="flex items-center gap-2 mb-3">
          <UBadge
            v-if="checkPop.done.value"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            :label="t('posts.publishedDone')"
            class="animate-nav-pop"
          />
          <StatusBadge
            v-else
            :value="overdue ? 'overdue' : post.status"
            :meta="POST_STATUS_META"
          />
          <span
            v-if="post.scheduledAt && ['scheduled', 'draft'].includes(post.status)"
            class="text-sm text-muted"
          >{{ t('posts.scheduledFor', { date: formatDateTime(post.scheduledAt, { locale, timeZone: tz }) }) }}</span>
          <UBadge
            v-if="post.pillar"
            color="neutral"
            variant="subtle"
            :icon="PILLAR_META[post.pillar].icon"
            :label="t(PILLAR_META[post.pillar].labelKey)"
            class="ml-auto"
          />
        </div>
        <p
          v-if="post.idea"
          class="text-sm text-muted flex items-center gap-1.5 mb-3 min-w-0"
        >
          <UIcon
            name="i-lucide-lightbulb"
            class="size-4 shrink-0"
          />
          <span class="truncate">{{ t('posts.fromIdea', { title: post.idea.title }) }}</span>
        </p>
        <div
          v-if="post.media.length"
          class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3"
        >
          <div
            v-for="m in post.media"
            :key="m.id"
            class="aspect-square rounded-md overflow-hidden bg-elevated"
          >
            <SmartImage
              v-if="m.kind === 'image'"
              :src="m.url"
              kind="media"
              class="size-full"
            />
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
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold">
              {{ t('posts.perPlatform') }}
            </h2>
            <UButton
              v-if="canSync"
              icon="i-lucide-refresh-cw"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="syncing"
              :label="t('posts.sync')"
              @click="sync"
            />
          </div>
          <p
            v-if="canSync"
            class="text-xs text-muted mt-1"
          >
            {{ t('posts.syncHint') }}
          </p>
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
                    · {{ t('posts.publishedAt', { date: when(target.publishedAt) }) }}
                  </template>
                </p>
                <p
                  v-if="target.syncedAt"
                  class="text-xs text-muted"
                >
                  {{ t('posts.syncedAt', { date: when(target.syncedAt) }) }}
                </p>
              </div>
              <UBadge
                v-if="target.removedAt"
                color="neutral"
                variant="subtle"
                :label="t('posts.removedOn', { platform: platformName(target) })"
              />
              <StatusBadge
                v-else
                :value="target.status"
                :meta="POST_TARGET_STATUS_META"
              />
            </div>
            <p
              v-if="target.removedAt"
              class="text-xs text-muted"
            >
              {{ t('posts.removedNote', { platform: platformName(target), date: when(target.removedAt) }) }}
            </p>
            <div
              v-if="ownCaption(target)"
              class="rounded-md bg-elevated/60 px-3 py-2"
            >
              <p class="text-[11px] text-muted">
                {{ t('posts.captionOn', { platform: platformName(target) }) }}
              </p>
              <p class="text-sm whitespace-pre-line break-words">
                {{ target.caption || t('posts.noCaption') }}
              </p>
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
              v-if="target.status === 'published' && !target.insights && !target.removedAt"
              class="text-xs text-muted"
            >
              {{ t('posts.metrics.pending') }}
            </p>
            <div
              v-if="target.changes.length"
              class="space-y-1"
            >
              <p class="text-xs font-medium text-highlighted">
                {{ t('posts.changeHistory') }}
              </p>
              <ul class="space-y-1">
                <li
                  v-for="change in target.changes"
                  :key="change.detectedAt + change.kind"
                  class="text-xs"
                >
                  <details v-if="change.kind === 'caption_changed'">
                    <summary class="cursor-pointer text-default">
                      {{ t(POST_CHANGE_LABELS[change.kind] ?? '', { platform: platformName(target) }) }}
                      <span class="text-muted">· {{ when(change.detectedAt) }}</span>
                    </summary>
                    <dl class="mt-1 grid gap-1 sm:grid-cols-2">
                      <div class="rounded-md bg-elevated/60 px-2 py-1.5">
                        <dt class="text-muted">
                          {{ t('posts.before') }}
                        </dt>
                        <dd class="whitespace-pre-line break-words">
                          {{ change.before || t('posts.noCaption') }}
                        </dd>
                      </div>
                      <div class="rounded-md bg-elevated/60 px-2 py-1.5">
                        <dt class="text-muted">
                          {{ t('posts.after') }}
                        </dt>
                        <dd class="whitespace-pre-line break-words">
                          {{ change.after || t('posts.noCaption') }}
                        </dd>
                      </div>
                    </dl>
                  </details>
                  <p
                    v-else
                    class="text-default"
                  >
                    {{ t(POST_CHANGE_LABELS[change.kind] ?? '', { platform: platformName(target) }) }}
                    <span class="text-muted">· {{ when(change.detectedAt) }}</span>
                  </p>
                </li>
              </ul>
              <p class="text-[11px] text-muted">
                {{ t('posts.changeHint') }}
              </p>
            </div>
            <UAlert
              v-if="target.errorCode && ['failed', 'needs_reauth', 'quota_deferred'].includes(target.status)"
              :color="target.status === 'failed' ? 'error' : 'warning'"
              variant="subtle"
              :title="t(PUBLISH_ERROR_LABELS[target.errorCode] ?? 'publishError.permanent')"
              :actions="target.status === 'needs_reauth'
                ? [{ label: t('posts.reconnect'), to: localePath('/app/accounts'), color: 'warning', variant: 'outline' }]
                : canWrite && target.status === 'failed' ? [{ label: retrying === target.id ? t('busy.publishing') : t('posts.retry'), color: 'error', variant: 'outline', loading: retrying === target.id, onClick: () => retry(target.id) }] : []"
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
          color="neutral"
          variant="outline"
          icon="i-lucide-circle-x"
          :loading="cancelling"
          :label="t('posts.cancel')"
          @click="cancel"
        />
        <UButton
          v-if="!post.targets.some(t => ['published', 'preparing', 'processing', 'publishing', 'publish_unknown'].includes(t.status))"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          :loading="removing"
          :label="t('posts.delete')"
          @click="remove"
        />
      </div>
    </div>
  </div>
</template>
