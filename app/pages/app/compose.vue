<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { defaultFormat } from '#shared/channels/formats'
import { CHANNELS, PLATFORM_META } from '#shared/channels/registry'
import type { Issue, MediaMeta, Platform, PostFormat } from '#shared/channels/types'
import { countChars, validateTarget } from '#shared/channels/validate'
import type { Aspect } from '#shared/media/edit-spec'
import { suggestAspect } from '#shared/media/presets'
import type { MediaView } from '#shared/media/types'
import { CONTENT_PILLARS, IDEA_TITLE_MAX, PILLAR_META, type ContentPillar, type IdeaDetail } from '#shared/utils/planner'
import type { SuccessChoice } from '~/components/ComposeSuccessSheet.vue'
import type { UploadItem } from '~/components/MediaUploader.vue'
import { slotLabel } from '~/utils/compose-when'
import type { ComposeDraft } from '~/utils/compose-draft'
import type { LinkRow } from '~/pages/app/links/index.vue'

interface Account { id: string, platform: Platform, username: string | null, avatarUrl: string | null, status: string }
interface TargetOptions { captionOverride: string, format: PostFormat | null, firstComment: string, altText: string }

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
const auth = useCreatorAuth()
const entitlements = useEntitlements()
const milestones = useMilestones()
const { confetti, spark } = useCelebrate()
const productLinks = useAddProductLink()

const editId = typeof route.query.post === 'string' ? route.query.post : null
const duplicateId = typeof route.query.duplicate === 'string' ? route.query.duplicate : null
// Bank Ide → "Jadikan postingan": saving the post takes the idea out of the bank.
const ideaId = !editId && !duplicateId && typeof route.query.idea === 'string' ? route.query.idea : null
const mediaParam = typeof route.query.media === 'string' ? route.query.media : null
const fromIdea = ref<Pick<IdeaDetail, 'id' | 'title' | 'note'> | null>(null)
useHead({ title: () => editId ? t('composer.editTitle') : t('composer.title') })

const tz = computed(() => auth.profile.value?.displayTimezone ?? 'Asia/Jakarta')
const accounts = ref<Account[]>([])
const activeAccounts = computed(() => accounts.value.filter(a => a.status === 'active'))
const selected = ref<string[]>([])
const caption = ref('')
const media = ref<UploadItem[]>([])
const uploader = useTemplateRef<{ edit: (key: string, aspect?: Aspect) => Promise<void> }>('uploader')
const captionField = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('captionField')
const scheduleButton = useTemplateRef<{ $el: HTMLElement }>('scheduleButton')
const options = reactive<Record<string, TargetOptions>>({})
const slot = ref(suggestedSlot(tz.value))
// Calendar: tapping an empty day opens the composer on that date.
if (typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)) slot.value = { ...slot.value, date: route.query.date }
const loading = ref(true)
const submitting = ref<null | 'schedule' | 'now' | 'draft'>(null)
const serverIssues = ref<(Issue & { socialAccountId?: string })[]>([])
const pillar = ref<ContentPillar | 'none'>('none')
const pillarItems = computed(() => [{ value: 'none', label: t('planner.pillarNone') }, ...CONTENT_PILLARS.map(value => ({ value, label: t(PILLAR_META[value].labelKey), icon: PILLAR_META[value].icon }))])

// "Tambah link produk": the vault short link goes into the caption; publishing swaps in a per-post link (attribution).
const linkPickerOpen = ref(false)
function insertLink(link: { shortUrl: string | null }) {
  if (!link.shortUrl) return
  caption.value = caption.value.trimEnd() ? `${caption.value.trimEnd()}\n\n${link.shortUrl}` : link.shortUrl
}

function readyItem(picked: MediaView): UploadItem {
  return { key: picked.id, mediaId: picked.id, previewUrl: picked.url ?? picked.posterUrl, posterUrl: picked.posterUrl, kind: picked.kind, mime: picked.mime, bytes: picked.bytes, status: 'ready', progress: 100, error: null, width: picked.width, height: picked.height, durationMs: picked.durationMs }
}

/** Ready Galeri items by id, in the order given (ids that are gone or still processing are skipped). */
async function readyMedia(ids: string[]): Promise<UploadItem[]> {
  const views = await Promise.all(ids.map(id => apiFetch<MediaView>(`/api/app/media/${id}`).catch(() => null)))
  return views.filter((v): v is MediaView => v?.status === 'ready').map(readyItem)
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

// Autosave: the words are kept in this browser; a newer-than-a-week draft is offered back when the composer opens empty.
const draftStore = useComposeDraft(() => auth.profile.value?.workspace.id)
const pendingDraft = ref<ComposeDraft | null>(null)

const snapshot = computed(() => ({
  caption: caption.value,
  selected: selected.value,
  mediaIds: media.value.filter(m => m.mediaId && m.status === 'ready').map(m => m.mediaId as string),
  options: JSON.parse(JSON.stringify(options)) as Record<string, TargetOptions>,
  pillar: pillar.value as string,
  slot: { ...slot.value }
}))
const fingerprint = computed(() => JSON.stringify([snapshot.value.caption, snapshot.value.mediaIds, snapshot.value.options]))
const loadedFingerprint = ref('')
const submitted = ref(false)
const dirty = computed(() => !loading.value && !submitted.value && fingerprint.value !== loadedFingerprint.value)
const { allowNextLeave } = useUnsavedChanges(dirty)

watch(snapshot, (value) => {
  if (loading.value || submitted.value || !isFreshComposer({ edit: editId, duplicate: duplicateId, idea: ideaId, media: mediaParam })) return
  if (pendingDraft.value) {
    // Typing while the offer is showing answers it: the old draft waits in a backup until the composer is left.
    if (isDraftEmpty(value)) return
    draftStore.stash()
    pendingDraft.value = null
  }
  draftStore.save(value)
})

async function restoreDraft() {
  const draft = pendingDraft.value
  pendingDraft.value = null
  if (!draft) return
  caption.value = draft.caption
  pillar.value = (draft.pillar as ContentPillar | 'none') || 'none'
  const ids = draft.selected.filter(id => activeAccounts.value.some(a => a.id === id))
  if (ids.length) selected.value = ids
  for (const [id, saved] of Object.entries(draft.options)) {
    if (accounts.value.some(a => a.id === id)) Object.assign(ensureOptions(id), saved)
  }
  if (draft.slot.date && new Date(toZonedIso(draft.slot.date, draft.slot.time, tz.value)).getTime() > Date.now()) slot.value = { ...draft.slot }
  media.value = await readyMedia(draft.mediaIds)
}
function discardDraft() {
  pendingDraft.value = null
  draftStore.clear()
}

onMounted(async () => {
  await entitlements.load()
  const channels = await apiFetch<{ items: Account[] }>('/api/app/channels')
  // Accounts that need reconnecting stay visible (greyed, with a way back) instead of vanishing.
  accounts.value = channels.items.filter(a => a.status === 'active' || a.status === 'needs_reauth')
  selected.value = activeAccounts.value.map(a => a.id) // smart default: post everywhere
  const sourceId = editId ?? duplicateId
  if (sourceId) {
    const post = await apiFetch<{ caption: string, scheduledAt: string | null, pillar: ContentPillar | null, media: { id: string, kind: 'image' | 'video', url: string | null, status: UploadItem['status'], width: number | null, height: number | null, durationMs: number | null }[], targets: { socialAccountId: string, format: PostFormat, captionOverride: string | null, options: { firstComment?: string, altText?: string } }[] }>(`/api/app/posts/${sourceId}`)
    caption.value = post.caption
    pillar.value = post.pillar ?? 'none'
    media.value = post.media.map(m => ({ key: m.id, mediaId: m.id, previewUrl: m.url, kind: m.kind, mime: m.kind === 'video' ? 'video/mp4' : 'image/jpeg', bytes: 0, status: m.status, progress: 100, error: null, width: m.width, height: m.height, durationMs: m.durationMs }))
    selected.value = post.targets.map(t => t.socialAccountId).filter(id => activeAccounts.value.some(a => a.id === id))
    for (const target of post.targets) Object.assign(ensureOptions(target.socialAccountId), { captionOverride: target.captionOverride ?? '', format: target.format, firstComment: target.options.firstComment ?? '', altText: target.options.altText ?? '' })
    if (editId && post.scheduledAt && new Date(post.scheduledAt) > new Date()) slot.value = zonedParts(new Date(post.scheduledAt), tz.value)
  } else if (ideaId) {
    // The idea's line opens the caption, its products follow as short links; the note stays a reminder above.
    const idea = await apiFetch<IdeaDetail>(`/api/app/planner/ideas/${ideaId}`).catch(() => null)
    if (idea?.status === 'open') {
      fromIdea.value = { id: idea.id, title: idea.title, note: idea.note }
      caption.value = [idea.title, ...idea.links.map(l => l.shortUrl).filter(Boolean)].join('\n\n')
      media.value = idea.media.filter(m => m.status === 'ready').map(readyItem)
      pillar.value = idea.pillar ?? 'none'
      if (idea.plannedOn && idea.plannedOn >= zonedParts(new Date(), tz.value).date) slot.value = { ...slot.value, date: idea.plannedOn }
    }
  } else if (mediaParam) {
    // Galeri Media → "Pakai di postingan": one id or a comma list, ready items only.
    media.value = await readyMedia(mediaParam.split(',').filter(Boolean).slice(0, 10))
  } else {
    pendingDraft.value = draftStore.read()
  }
  loadedFingerprint.value = fingerprint.value
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

const previewEntries = computed(() => selectedAccounts.value.map(account => ({ platform: account.platform, username: account.username, avatarUrl: account.avatarUrl, format: formatFor(account), caption: captionFor(account) })))

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

// A pasted marketplace link offers to become a tracked link (SCREENS principle 4).
const settledCaption = refDebounced(caption, 400)
const dismissedUrls = ref<string[]>([])
const rawUrls = computed(() => productLinks.findMarketplaceUrls(settledCaption.value).filter((url, i, all) => all.indexOf(url) === i && !dismissedUrls.value.includes(url)))
const convertingUrl = ref<string | null>(null)
async function makeProductLink(url: string, event: MouseEvent) {
  convertingUrl.value = url
  try {
    const { link } = await productLinks.create(url, { showInBio: true })
    const short = (link as LinkRow).shortUrl
    if (short) caption.value = caption.value.split(url).join(short)
    spark(event)
  } catch (caught) {
    if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    convertingUrl.value = null
  }
}

/** A product going out on Instagram that no Balas Otomatis rule sends yet; best effort, never in the way of the saved post. */
async function autoReplyHint(postId: string) {
  if (!auth.hasAbility('autoreply.manage')) return null
  const { hint } = await apiFetch<{ hint: { linkId: string, linkTitle: string | null } | null }>(`/api/app/posts/${postId}/auto-reply-hint`).catch(() => ({ hint: null }))
  return hint
}
async function offerAutoReply(postId: string) {
  const hint = await autoReplyHint(postId)
  if (!hint) return
  toast.add({
    title: t('composer.autoReplyHint'),
    description: hint.linkTitle ?? undefined,
    icon: 'i-lucide-message-circle-reply',
    duration: 10_000,
    actions: [{ label: t('composer.autoReplyAction'), to: localePath({ path: '/app/auto-reply/new', query: { template: 'mau', link: hint.linkId } }), color: 'primary' }]
  })
}

/** "Simpan sebagai ide": not ready to post yet; the first line becomes the idea, the rest its note. */
const savingIdea = ref(false)
async function saveAsIdea() {
  const [first = '', ...rest] = caption.value.trim().split('\n')
  savingIdea.value = true
  try {
    await apiFetch('/api/app/planner/ideas', {
      method: 'POST',
      body: {
        title: first.trim().slice(0, IDEA_TITLE_MAX),
        note: rest.join('\n').trim() || null,
        plannedOn: slot.value.date || null,
        pillar: pillar.value === 'none' ? null : pillar.value,
        mediaIds: media.value.filter(m => m.mediaId && m.status === 'ready').map(m => m.mediaId)
      }
    })
    toast.add({ title: t('composer.savedIdea'), color: 'success' })
    submitted.value = true
    draftStore.clear()
    allowNextLeave()
    await navigateTo(localePath('/app/calendar'))
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    savingIdea.value = false
  }
}

const counters = computed(() => [...new Set(selectedAccounts.value.map(a => a.platform))].map(platform => ({ platform, count: countChars(caption.value), max: CHANNELS[platform].maxChars })))
const counterTone = (c: { count: number, max: number }) => c.count > c.max ? 'text-error' : c.count >= c.max * 0.9 ? 'text-warning' : 'text-muted'

// Caption starters: dropped in at the cursor (or at the end when the box is not focused).
const TEMPLATE_KEYS = ['discount', 'review', 'unboxing'] as const
function insertTemplate(key: typeof TEMPLATE_KEYS[number]) {
  const text = t(`composer.templates.${key}`)
  const el = captionField.value?.textareaRef
  if (el && document.activeElement === el) {
    const start = el.selectionStart
    const end = el.selectionEnd
    caption.value = `${caption.value.slice(0, start)}${text}${caption.value.slice(end)}`
    nextTick(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
    return
  }
  caption.value = caption.value.trimEnd() ? `${caption.value.trimEnd()}\n\n${text}` : text
}

const remaining = computed(() => entitlements.isUnlimited('scheduledPostsPerMonth') ? null : entitlements.remaining('scheduledPostsPerMonth'))
const whenLabel = computed(() => slotLabel(slot.value, tz.value, t, locale.value))

function formatOptions(account: Account) {
  return CHANNELS[account.platform].formats.map(value => ({ value, label: t(`format.${value}`) }))
}

function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id]
}

const moreActions = computed(() => [
  [
    { label: t('composer.now'), icon: 'i-lucide-send', disabled: !selected.value.length, onSelect: () => submit('now') },
    { label: t('composer.draft'), icon: 'i-lucide-file-pen-line', onSelect: () => submit('draft') },
    ...(!editId && !fromIdea.value ? [{ label: t('composer.saveIdea'), icon: 'i-lucide-lightbulb', disabled: !caption.value.trim(), onSelect: saveAsIdea }] : [])
  ]
])

const success = reactive({ open: false, scheduledAt: '', caption: '', imageUrl: null as string | null, hintLinkId: null as string | null })

function resetComposer() {
  caption.value = ''
  media.value = []
  for (const key of Object.keys(options)) options[key] = { captionOverride: '', format: null, firstComment: '', altText: '' }
  pillar.value = 'none'
  slot.value = suggestedSlot(tz.value)
  selected.value = activeAccounts.value.map(a => a.id)
  attempted.value = false
  dismissedUrls.value = []
  loadedFingerprint.value = fingerprint.value
  submitted.value = false
  if (import.meta.client) window.scrollTo({ top: 0 })
}

function onSuccessChoice(choice: SuccessChoice) {
  if (choice === 'again') return resetComposer()
  allowNextLeave()
  if (choice === 'calendar') return void navigateTo(localePath('/app/calendar'))
  void navigateTo(localePath({ path: '/app/auto-reply/new', query: success.hintLinkId ? { template: 'mau', link: success.hintLinkId } : { template: 'mau' } }))
}
function onSuccessDismiss() {
  allowNextLeave()
  void navigateTo(localePath({ path: '/app/posts', query: { tab: 'scheduled' } }))
}

async function submit(mode: 'schedule' | 'now' | 'draft') {
  serverIssues.value = []
  if (mode !== 'draft') attempted.value = true
  if (mode !== 'draft') {
    if (mediaBusy.value) return toast.add({ title: t('composer.mediaPending'), color: 'warning' })
    if (blocking.value || mediaFailed.value) return toast.add({ title: t('composer.fixFirst'), color: 'warning' })
  }
  const scheduledAt = toZonedIso(slot.value.date, slot.value.time, tz.value)
  if (mode === 'schedule' && new Date(scheduledAt).getTime() < Date.now()) return toast.add({ title: t('composer.pastTime'), color: 'warning' })
  const wasFirst = !auth.profile.value?.onboarding.postScheduled
  const when = whenLabel.value
  const firstMedia = media.value[0]
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
      scheduledAt: mode === 'now' ? undefined : scheduledAt,
      pillar: pillar.value === 'none' ? null : pillar.value,
      ideaId: fromIdea.value?.id
    }
    const saved = editId
      ? await apiFetch<{ postId: string }>(`/api/app/posts/${editId}`, { method: 'PATCH', body })
      : await apiFetch<{ postId: string }>('/api/app/posts', { method: 'POST', body })
    submitted.value = true
    draftStore.clear()
    haptic('success')
    if (mode !== 'draft' && scheduleButton.value?.$el) spark(scheduleButton.value.$el)
    void entitlements.load(true)
    void auth.fetchProfile()

    if (mode === 'draft') {
      toast.add({ title: t('composer.savedDraft'), color: 'success' })
    } else if (mode === 'now') {
      toast.add({ title: t('composer.postingNow'), color: 'success' })
      void offerAutoReply(saved.postId)
    } else if (wasFirst && milestones.reach('firstPostScheduled')) {
      // The first scheduled post is a moment: confetti and a sheet that says what happens next.
      void confetti({ big: true })
      const hint = await autoReplyHint(saved.postId)
      Object.assign(success, { scheduledAt, caption: caption.value, imageUrl: firstMedia ? (firstMedia.kind === 'image' ? firstMedia.previewUrl : firstMedia.posterUrl ?? null) : null, hintLinkId: hint?.linkId ?? null, open: true })
      return
    } else {
      toast.add({ title: t('composer.scheduledAt', { when }), color: 'success', actions: [{ label: t('composer.seeCalendar'), to: localePath('/app/calendar'), color: 'neutral', variant: 'outline' }] })
      void offerAutoReply(saved.postId)
    }
    allowNextLeave()
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
  <div class="w-full max-w-5xl mx-auto pb-16 lg:pb-0">
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
        <UAlert
          v-if="fromIdea"
          color="info"
          variant="subtle"
          icon="i-lucide-lightbulb"
          :title="t('composer.fromIdea', { title: fromIdea.title })"
          :description="fromIdea.note ?? undefined"
          class="whitespace-pre-line"
        />
        <UAlert
          v-if="pendingDraft"
          color="primary"
          variant="subtle"
          icon="i-lucide-notebook-pen"
          :title="t('composer.resume.title')"
          :actions="[{ label: t('composer.resume.yes'), color: 'primary', variant: 'solid', size: 'xs', onClick: restoreDraft }, { label: t('composer.resume.no'), color: 'neutral', variant: 'outline', size: 'xs', onClick: discardDraft }]"
        />
        <UCard>
          <div class="space-y-5">
            <div>
              <p class="text-sm font-medium mb-2">
                {{ t('composer.accounts') }}
              </p>
              <div class="flex flex-wrap gap-2">
                <template
                  v-for="account in accounts"
                  :key="account.id"
                >
                  <button
                    v-if="account.status === 'active'"
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
                  <div
                    v-else
                    class="flex items-center gap-2 rounded-full border border-dashed border-default pl-3 pr-1.5 py-1 text-sm text-muted"
                  >
                    <UIcon
                      :name="PLATFORM_META[account.platform].icon"
                      class="size-4 opacity-60"
                    />
                    <span class="max-w-36 truncate opacity-70">{{ account.username || PLATFORM_META[account.platform].name }}</span>
                    <UButton
                      :to="localePath('/app/accounts')"
                      size="xs"
                      color="warning"
                      variant="solid"
                      class="rounded-full"
                      :label="t('composer.reconnect')"
                      @click="allowNextLeave()"
                    />
                  </div>
                </template>
              </div>
            </div>

            <UFormField :label="t('composer.caption')">
              <UTextarea
                ref="captionField"
                v-model="caption"
                :rows="6"
                autoresize
                :placeholder="t('composer.captionPlaceholder')"
                class="w-full"
              />
              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                <UButton
                  v-for="key in TEMPLATE_KEYS"
                  :key="key"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :label="t(`composer.templateLabel.${key}`)"
                  @click="insertTemplate(key)"
                />
              </div>
              <div class="flex flex-wrap items-center gap-3 mt-2 text-xs">
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
                  class="flex items-center gap-1.5 tabular-nums"
                  :class="counterTone(c)"
                >
                  <ProgressRing
                    :value="(c.count / c.max) * 100"
                    :size="16"
                    :label="`${c.count}/${c.max}`"
                  />
                  <UIcon
                    :name="PLATFORM_META[c.platform].icon"
                    class="size-3.5"
                  />
                  {{ c.count }}/{{ c.max }}
                </span>
              </div>
              <TransitionGroup
                name="list"
                tag="ul"
                class="mt-2 space-y-2 empty:hidden"
              >
                <li
                  v-for="url in rawUrls"
                  :key="url"
                  class="flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm"
                >
                  <UIcon
                    name="i-lucide-link-2"
                    class="size-4 text-primary shrink-0"
                  />
                  <span class="min-w-0 flex-1">
                    {{ t('composer.rawLink.ask') }}
                    <span class="block text-xs text-muted truncate">{{ url }}</span>
                  </span>
                  <UButton
                    size="xs"
                    :loading="convertingUrl === url"
                    :label="t('composer.rawLink.make')"
                    @click="makeProductLink(url, $event)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :label="t('composer.rawLink.keep')"
                    @click="dismissedUrls.push(url)"
                  />
                </li>
              </TransitionGroup>
              <HashtagPanel
                v-model="caption"
                :platforms="selectedPlatforms"
                :attempted="attempted"
                class="mt-3"
                @threads-version="applyThreadsVersion"
              />
            </UFormField>
          </div>
        </UCard>

        <MediaUploader
          ref="uploader"
          v-model="media"
          :max="10"
          card
          paste
          :title="t('composer.media')"
        />

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
          <p class="text-sm font-medium mb-3">
            {{ t('composer.when') }}
          </p>
          <ComposeWhen
            v-model="slot"
            :tz="tz"
          />
          <p
            v-if="remaining !== null"
            class="text-xs text-muted mt-2"
          >
            {{ t('composer.remaining', { count: remaining }) }}
          </p>
        </UCard>

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
                <UFormField
                  :label="t('planner.pillarLabel')"
                  :description="t('planner.pillarHint')"
                >
                  <USelect
                    v-model="pillar"
                    :items="pillarItems"
                    class="w-full sm:w-56"
                  />
                </UFormField>
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

        <UCard
          v-if="selectedAccounts.length"
          class="lg:hidden"
        >
          <p class="text-sm font-medium mb-3">
            {{ t('composer.preview') }}
          </p>
          <ComposerPreview
            :entries="previewEntries"
            :media="media"
          />
        </UCard>

        <StickyActionBar class="lg:bottom-4">
          <template #leading>
            <span
              v-if="whenLabel"
              class="flex items-center gap-1.5 truncate"
            >
              <UIcon
                name="i-lucide-clock"
                class="size-4 shrink-0"
              />
              <span class="truncate">{{ whenLabel }}</span>
            </span>
          </template>
          <UDropdownMenu
            :items="moreActions"
            :content="{ align: 'end', side: 'top' }"
          >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-ellipsis"
              :loading="submitting === 'now' || submitting === 'draft' || savingIdea"
              :disabled="submitting === 'schedule'"
              :aria-label="t('common.more')"
            />
          </UDropdownMenu>
          <SaveButton
            ref="scheduleButton"
            v-spark.manual
            icon="i-lucide-calendar-check"
            :label="t('composer.schedule')"
            :busy-label="t('busy.scheduling')"
            :loading="submitting === 'schedule'"
            :disabled="!selected.length || Boolean(submitting)"
            @click="submit('schedule')"
          />
        </StickyActionBar>
      </div>

      <div
        v-if="selectedAccounts.length"
        class="hidden lg:block lg:sticky lg:top-4"
      >
        <UCard>
          <p class="text-sm font-medium mb-3">
            {{ t('composer.preview') }}
          </p>
          <ComposerPreview
            :entries="previewEntries"
            :media="media"
          />
        </UCard>
      </div>
    </div>
    <ProductLinkPicker
      v-model:open="linkPickerOpen"
      @pick="insertLink"
    />
    <ComposeSuccessSheet
      v-model:open="success.open"
      :scheduled-at="success.scheduledAt"
      :tz="tz"
      :caption="success.caption"
      :image-url="success.imageUrl"
      :can-auto-reply="auth.hasAbility('autoreply.manage')"
      @choose="onSuccessChoice"
      @dismiss="onSuccessDismiss"
    />
  </div>
</template>
