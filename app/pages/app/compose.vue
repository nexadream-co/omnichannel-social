<script setup lang="ts">
import { defaultFormat } from '#shared/channels/formats'
import { CHANNELS, PLATFORM_META } from '#shared/channels/registry'
import type { Issue, MediaMeta, Platform, PostFormat } from '#shared/channels/types'
import { countChars, validateTarget } from '#shared/channels/validate'
import type { Aspect } from '#shared/media/edit-spec'
import { suggestAspect } from '#shared/media/presets'
import type { MediaView } from '#shared/media/types'
import type { UploadItem } from '~/components/MediaUploader.vue'

interface Account { id: string, platform: Platform, username: string | null, avatarUrl: string | null, status: string }
interface TargetOptions { captionOverride: string, format: PostFormat | null, firstComment: string, altText: string }

definePageMeta({ layout: 'creator' })
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
const auth = useCreatorAuth()
const entitlements = useEntitlements()

const editId = typeof route.query.post === 'string' ? route.query.post : null
const duplicateId = typeof route.query.duplicate === 'string' ? route.query.duplicate : null
useHead({ title: () => editId ? t('composer.editTitle') : t('composer.title') })

const tz = computed(() => auth.profile.value?.displayTimezone ?? 'Asia/Jakarta')
const accounts = ref<Account[]>([])
const selected = ref<string[]>([])
const caption = ref('')
const media = ref<UploadItem[]>([])
const uploader = useTemplateRef<{ edit: (key: string, aspect?: Aspect) => Promise<void> }>('uploader')
const options = reactive<Record<string, TargetOptions>>({})
const slot = reactive(suggestedSlot(tz.value))
// Calendar: tapping an empty day opens the composer on that date.
if (typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)) slot.date = route.query.date
const loading = ref(true)
const submitting = ref<null | 'schedule' | 'now' | 'draft'>(null)
const serverIssues = ref<(Issue & { socialAccountId?: string })[]>([])

// "Tambah link produk": the vault short link goes into the caption; publishing swaps in a per-post link (attribution).
const linkPickerOpen = ref(false)
function insertLink(link: { shortUrl: string | null }) {
  if (!link.shortUrl) return
  caption.value = caption.value.trimEnd() ? `${caption.value.trimEnd()}\n\n${link.shortUrl}` : link.shortUrl
}

// Threads takes one tag: the tag panel hands over a one-tag copy of the caption for every selected Threads account.
const selectedPlatforms = computed(() => [...new Set(selectedAccounts.value.map(a => a.platform))])
function applyThreadsVersion(text: string) {
  for (const account of selectedAccounts.value.filter(a => a.platform === 'threads')) ensureOptions(account.id).captionOverride = text
}

function ensureOptions(id: string) {
  options[id] ??= { captionOverride: '', format: null, firstComment: '', altText: '' }
  return options[id]!
}

onMounted(async () => {
  await entitlements.load()
  const channels = await apiFetch<{ items: Account[] }>('/api/app/channels')
  accounts.value = channels.items.filter(a => a.status === 'active')
  selected.value = accounts.value.map(a => a.id) // smart default: post everywhere
  const sourceId = editId ?? duplicateId
  if (sourceId) {
    const post = await apiFetch<{ caption: string, scheduledAt: string | null, media: { id: string, kind: 'image' | 'video', url: string | null, status: UploadItem['status'], width: number | null, height: number | null, durationMs: number | null }[], targets: { socialAccountId: string, format: PostFormat, captionOverride: string | null, options: { firstComment?: string, altText?: string } }[] }>(`/api/app/posts/${sourceId}`)
    caption.value = post.caption
    media.value = post.media.map(m => ({ key: m.id, mediaId: m.id, previewUrl: m.url, kind: m.kind, mime: m.kind === 'video' ? 'video/mp4' : 'image/jpeg', bytes: 0, status: m.status, progress: 100, error: null, width: m.width, height: m.height, durationMs: m.durationMs }))
    selected.value = post.targets.map(t => t.socialAccountId).filter(id => accounts.value.some(a => a.id === id))
    for (const target of post.targets) Object.assign(ensureOptions(target.socialAccountId), { captionOverride: target.captionOverride ?? '', format: target.format, firstComment: target.options.firstComment ?? '', altText: target.options.altText ?? '' })
    if (editId && post.scheduledAt && new Date(post.scheduledAt) > new Date()) Object.assign(slot, zonedParts(new Date(post.scheduledAt), tz.value))
  } else if (typeof route.query.media === 'string') {
    // Galeri Media → "Pakai di postingan".
    const picked = await apiFetch<MediaView>(`/api/app/media/${route.query.media}`).catch(() => null)
    if (picked?.status === 'ready') {
      media.value = [{ key: picked.id, mediaId: picked.id, previewUrl: picked.url ?? picked.posterUrl, posterUrl: picked.posterUrl, kind: picked.kind, mime: picked.mime, bytes: picked.bytes, status: 'ready', progress: 100, error: null, width: picked.width, height: picked.height, durationMs: picked.durationMs }]
    }
  }
  loading.value = false
})

const selectedAccounts = computed(() => accounts.value.filter(a => selected.value.includes(a.id)))
const mediaMetas = computed<MediaMeta[]>(() => media.value.map(m => ({ kind: m.kind, mime: m.mime, bytes: m.bytes, width: m.width, height: m.height, durationMs: m.durationMs })))
const mediaBusy = computed(() => media.value.some(m => m.status === 'uploading' || m.status === 'processing'))
const mediaFailed = computed(() => media.value.some(m => m.status === 'failed'))

function formatFor(account: Account): PostFormat {
  return ensureOptions(account.id).format ?? defaultFormat(account.platform, mediaMetas.value)
}
function captionFor(account: Account) {
  return ensureOptions(account.id).captionOverride.trim() || caption.value
}

/** The same rules the server applies (shared/channels/validate.ts), shown as friendly hints before submit. */
const issues = computed(() => selectedAccounts.value.flatMap(account => validateTarget(CHANNELS[account.platform], { format: formatFor(account), caption: captionFor(account), firstComment: ensureOptions(account.id).firstComment }, mediaMetas.value)
  .map(issue => ({ ...issue, account }))))
const blocking = computed(() => issues.value.some(i => i.level === 'error'))
// Friendly hints (warnings) show while typing; errors only after the first attempt, so a newcomer
// opening an empty composer isn't greeted by red boxes.
const attempted = ref(false)
const visibleIssues = computed(() => issues.value.filter(i => i.level === 'warning' || attempted.value))
/** "Atur potongan" / "Potong video" on a media hint: opens the editor on that item, on the shape the platform keeps. */
function fixAction(issue: Issue & { account: Account }) {
  const index = Number(issue.field?.split('.')[1])
  const item = Number.isInteger(index) ? media.value[index] : undefined
  if (!item || item.status !== 'ready') return undefined
  if (issue.code === 'channel.imageWillBeCropped' && item.width && item.height) {
    const bounds = CHANNELS[issue.account.platform].media[formatFor(issue.account)]?.image?.aspect
    const aspect = suggestAspect(item.width / item.height, bounds)
    return [{ label: t('mediaEditor.fixCrop'), color: 'warning' as const, variant: 'solid' as const, size: 'xs' as const, onClick: () => uploader.value?.edit(item.key, aspect) }]
  }
  if (issue.code === 'channel.videoTooLong') {
    return [{ label: t('mediaEditor.fixTrim'), color: 'error' as const, variant: 'solid' as const, size: 'xs' as const, onClick: () => uploader.value?.edit(item.key) }]
  }
  return undefined
}

const counters = computed(() => [...new Set(selectedAccounts.value.map(a => a.platform))].map(platform => ({ platform, count: countChars(caption.value), max: CHANNELS[platform].maxChars })))

const remaining = computed(() => entitlements.isUnlimited('scheduledPostsPerMonth') ? null : entitlements.remaining('scheduledPostsPerMonth'))

function formatOptions(account: Account) {
  return CHANNELS[account.platform].formats.map(value => ({ value, label: t(`format.${value}`) }))
}

function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id]
}

async function submit(mode: 'schedule' | 'now' | 'draft') {
  serverIssues.value = []
  if (mode !== 'draft') attempted.value = true
  if (mode !== 'draft') {
    if (mediaBusy.value) return toast.add({ title: t('composer.mediaPending'), color: 'warning' })
    if (blocking.value || mediaFailed.value) return toast.add({ title: t('composer.fixFirst'), color: 'warning' })
  }
  const scheduledAt = toZonedIso(slot.date, slot.time, tz.value)
  if (mode === 'schedule' && new Date(scheduledAt).getTime() < Date.now()) return toast.add({ title: t('composer.pastTime'), color: 'warning' })
  submitting.value = mode
  try {
    const body = {
      caption: caption.value,
      mediaIds: media.value.filter(m => m.mediaId && m.status !== 'failed').map(m => m.mediaId),
      targets: selectedAccounts.value.map(account => ({
        socialAccountId: account.id,
        format: ensureOptions(account.id).format ?? undefined,
        captionOverride: ensureOptions(account.id).captionOverride || null,
        firstComment: ensureOptions(account.id).firstComment || undefined,
        altText: ensureOptions(account.id).altText || undefined
      })),
      mode,
      scheduledAt: mode === 'now' ? undefined : scheduledAt
    }
    if (editId) await apiFetch(`/api/app/posts/${editId}`, { method: 'PATCH', body })
    else await apiFetch('/api/app/posts', { method: 'POST', body })
    toast.add({ title: t(mode === 'draft' ? 'composer.savedDraft' : mode === 'now' ? 'composer.publishedNow' : 'composer.scheduled'), color: 'success' })
    await entitlements.load(true)
    await navigateTo(localePath({ path: '/app/posts', query: { tab: mode === 'draft' ? 'draft' : 'scheduled' } }))
  } catch (caught) {
    if (entitlements.handlePlanError(caught)) return
    const data = (caught as { data?: { data?: { issues?: (Issue & { socialAccountId?: string })[] } } }).data?.data
    if (data?.issues) serverIssues.value = data.issues
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    submitting.value = null
  }
}
</script>

<template>
  <div class="w-full max-w-5xl mx-auto">
    <CommandBar :title="editId ? t('composer.editTitle') : t('composer.title')" />

    <div
      v-if="loading"
      class="grid lg:grid-cols-[1fr_22rem] gap-6"
    >
      <USkeleton class="h-96 w-full" />
      <USkeleton class="h-64 w-full hidden lg:block" />
    </div>

    <UCard
      v-else-if="!accounts.length"
      class="text-center"
    >
      <UIcon
        name="i-lucide-at-sign"
        class="size-8 text-muted mx-auto"
      />
      <p class="mt-3 text-default">
        {{ t('composer.noAccounts') }}
      </p>
      <UButton
        :to="localePath('/app/accounts')"
        :label="t('composer.connect')"
        class="mt-4"
      />
    </UCard>

    <div
      v-else
      class="grid lg:grid-cols-[1fr_22rem] gap-6 items-start"
    >
      <div class="space-y-5 min-w-0">
        <UCard>
          <div class="space-y-5">
            <div>
              <p class="text-sm font-medium mb-2">
                {{ t('composer.accounts') }}
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="account in accounts"
                  :key="account.id"
                  type="button"
                  class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
                  :class="selected.includes(account.id) ? 'border-primary bg-primary/10 text-highlighted' : 'border-default text-muted'"
                  :aria-pressed="selected.includes(account.id)"
                  @click="toggle(account.id)"
                >
                  <UIcon
                    :name="PLATFORM_META[account.platform].icon"
                    class="size-4"
                  />
                  <span class="max-w-36 truncate">{{ account.username || PLATFORM_META[account.platform].name }}</span>
                  <UIcon
                    v-if="selected.includes(account.id)"
                    name="i-lucide-check"
                    class="size-4 text-primary"
                  />
                </button>
              </div>
            </div>

            <UFormField :label="t('composer.caption')">
              <UTextarea
                v-model="caption"
                :rows="6"
                autoresize
                :placeholder="t('composer.captionPlaceholder')"
                class="w-full"
              />
              <div class="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
                <UButton
                  size="xs"
                  variant="soft"
                  icon="i-lucide-link"
                  :label="t('links.insert')"
                  @click="linkPickerOpen = true"
                />
                <span
                  v-for="c in counters"
                  :key="c.platform"
                  class="flex items-center gap-1"
                  :class="c.count > c.max ? 'text-error' : 'text-muted'"
                >
                  <UIcon
                    :name="PLATFORM_META[c.platform].icon"
                    class="size-3.5"
                  />
                  {{ c.count }}/{{ c.max }}
                </span>
              </div>
              <HashtagPanel
                v-model="caption"
                :platforms="selectedPlatforms"
                class="mt-3"
                @threads-version="applyThreadsVersion"
              />
            </UFormField>

            <div>
              <p class="text-sm font-medium mb-2">
                {{ t('composer.media') }}
              </p>
              <MediaUploader
                ref="uploader"
                v-model="media"
                :max="10"
              />
            </div>
          </div>
        </UCard>

        <ul
          v-if="visibleIssues.length"
          class="space-y-2"
        >
          <li
            v-for="(issue, index) in visibleIssues"
            :key="`c${index}`"
          >
            <UAlert
              :color="issue.level === 'error' ? 'error' : 'warning'"
              variant="subtle"
              :icon="PLATFORM_META[issue.account.platform].icon"
              :title="t(issue.code, issue.params ?? {})"
              :actions="fixAction(issue)"
            />
          </li>
        </ul>

        <UCard>
          <UCollapsible :unmount-on-hide="false">
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-between px-0"
              :label="t('composer.advanced')"
              trailing-icon="i-lucide-chevron-down"
            />
            <template #content>
              <div class="space-y-6 pt-4">
                <div
                  v-for="account in selectedAccounts"
                  :key="account.id"
                  class="space-y-3"
                >
                  <p class="text-sm font-semibold flex items-center gap-2">
                    <UIcon :name="PLATFORM_META[account.platform].icon" />
                    {{ account.username || PLATFORM_META[account.platform].name }}
                  </p>
                  <UFormField :label="t('composer.format', { platform: PLATFORM_META[account.platform].name })">
                    <USelect
                      :model-value="formatFor(account)"
                      :items="formatOptions(account)"
                      class="w-full sm:w-56"
                      @update:model-value="(value: PostFormat) => ensureOptions(account.id).format = value"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('composer.perPlatform', { platform: PLATFORM_META[account.platform].name })"
                    :description="t('composer.perPlatformHint')"
                  >
                    <UTextarea
                      v-model="ensureOptions(account.id).captionOverride"
                      :rows="2"
                      autoresize
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    v-if="CHANNELS[account.platform].supportsFirstComment"
                    :label="t('composer.firstComment')"
                  >
                    <UInput
                      v-model="ensureOptions(account.id).firstComment"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    v-if="media.some(m => m.kind === 'image')"
                    :label="t('composer.altText')"
                  >
                    <UInput
                      v-model="ensureOptions(account.id).altText"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </template>
          </UCollapsible>
        </UCard>
      </div>

      <div class="space-y-5 lg:sticky lg:top-4">
        <UCard>
          <p class="text-sm font-medium mb-3">
            {{ t('composer.when') }}
          </p>
          <div class="grid grid-cols-2 gap-2">
            <UFormField :label="t('composer.date')">
              <UInput
                v-model="slot.date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('composer.time')">
              <UInput
                v-model="slot.time"
                type="time"
                class="w-full"
              />
            </UFormField>
          </div>
          <p class="text-xs text-muted mt-2">
            {{ t('composer.suggested') }} · {{ t(`timezones.${tz}`).split(' ')[0] }}
          </p>
          <p
            v-if="remaining !== null"
            class="text-xs text-muted mt-1"
          >
            {{ t('composer.remaining', { count: remaining }) }}
          </p>
          <div class="space-y-2 mt-4">
            <UButton
              block
              size="lg"
              icon="i-lucide-calendar-check"
              :loading="submitting === 'schedule'"
              :disabled="!selected.length || Boolean(submitting)"
              :label="t('composer.schedule')"
              @click="submit('schedule')"
            />
            <UButton
              block
              variant="outline"
              icon="i-lucide-send"
              :loading="submitting === 'now'"
              :disabled="!selected.length || Boolean(submitting)"
              :label="t('composer.now')"
              @click="submit('now')"
            />
            <UButton
              block
              variant="link"
              color="neutral"
              :loading="submitting === 'draft'"
              :disabled="Boolean(submitting)"
              :label="t('composer.draft')"
              @click="submit('draft')"
            />
          </div>
        </UCard>

        <UCard v-if="selectedAccounts.length">
          <p class="text-sm font-medium mb-3">
            {{ t('composer.preview') }}
          </p>
          <div class="space-y-4">
            <div
              v-for="account in selectedAccounts"
              :key="account.id"
              class="rounded-md border border-default overflow-hidden"
            >
              <div class="flex items-center gap-2 px-3 py-2 border-b border-default">
                <UAvatar
                  :src="account.avatarUrl ?? undefined"
                  :icon="PLATFORM_META[account.platform].icon"
                  size="xs"
                />
                <span class="text-sm font-medium truncate">{{ account.username || PLATFORM_META[account.platform].name }}</span>
                <UBadge
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  class="ml-auto"
                  :label="t(`format.${formatFor(account)}`)"
                />
              </div>
              <img
                v-if="media[0]?.previewUrl && media[0].kind === 'image'"
                :src="media[0].previewUrl"
                alt=""
                class="w-full aspect-square object-cover"
              >
              <p class="px-3 py-2 text-sm whitespace-pre-line line-clamp-4 break-words">
                {{ captionFor(account) || t('posts.noCaption') }}
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </div>
    <ProductLinkPicker
      v-model:open="linkPickerOpen"
      @pick="insertLink"
    />
  </div>
</template>
