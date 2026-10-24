<script setup lang="ts">
import { CHANNELS, PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { extractRawTags, extractTags, insertTags, keepTags, normalizeTag, removeTag } from '#shared/hashtags/parse'
import { checkTags, tagLimitFor, type TagCheck } from '#shared/hashtags/quality'
import { suggestFromLibrary } from '#shared/hashtags/relevance'
import { activityLevel, type LibraryTag, type TagActivity, type TagNiche } from '#shared/hashtags/types'
import { matchNiche, nicheSuggestions } from '~/utils/niche-tags'

interface ResearchItem {
  tag: string
  sources: ('list' | 'history' | 'mine')[]
  fit: number
  quality: Pick<TagCheck, 'level' | 'codes'>
  performance: { posts: number, ratio: number | null, label: 'better' | 'average' | 'worse' | 'notEnoughData' } | null
  activity: TagActivity | null
}
interface ResearchView {
  runId: string
  status: 'pending' | 'ready'
  threads: 'off' | 'notSelected' | 'noAccount' | 'needsReconnect' | 'pending' | 'ready'
  items: ResearchItem[]
  usage: { used: number, limit: number }
}
interface HashtagSet { id: string, name: string, tags: string[] }

/**
 * Tag help under the caption: live quality chips for the tags already written, and a slideover with
 * list ideas (free), research (paid) and saved sets (free). Nothing here is required to post.
 */
const caption = defineModel<string>({ required: true })
const props = defineProps<{ platforms: Platform[], attempted?: boolean }>()
const emit = defineEmits<{ threadsVersion: [caption: string] }>()
const { t } = useI18n()
const toast = useToast()
const entitlements = useEntitlements()

const library = useState<LibraryTag[] | null>('hashtag-library', () => null)
onMounted(async () => {
  library.value ??= (await apiFetch<{ items: LibraryTag[] }>('/api/app/hashtags/library').catch(() => ({ items: [] }))).items
})

// The check runs on every edit, so it reads a slightly delayed copy of the caption.
const settled = ref(caption.value)
let settle: ReturnType<typeof setTimeout> | undefined
watch(caption, (value) => {
  clearTimeout(settle)
  settle = setTimeout(() => settled.value = value, 250)
})
const quality = computed(() => checkTags({ tags: extractRawTags(settled.value), caption: settled.value, platforms: props.platforms, library: library.value ?? [] }))
const sharing = computed(() => props.platforms.length > 1 ? props.platforms.filter(p => p !== 'threads') : props.platforms)
const limit = computed(() => tagLimitFor(sharing.value))
const limitPlatform = computed(() => sharing.value.find(p => CHANNELS[p].maxHashtags === limit.value))
const inCaption = computed(() => new Set(extractTags(caption.value).map(normalizeTag)))

/** The tag that hurts the most is the one to drop first: worst level wins, the last one written on a tie. */
const worstTag = computed(() => {
  const rank = { error: 2, warning: 1, good: 0 } as const
  return quality.value.tags.reduce<typeof quality.value.tags[number] | null>((worst, check) => !worst || rank[check.level] >= rank[worst.level] ? check : worst, null)
})
function issueColor(issue: { code: string, level: string }) {
  if (issue.code === 'overLimit') return props.attempted ? 'text-error' : 'text-warning'
  return issue.level === 'error' ? 'text-error' : 'text-warning'
}
function dropWorst() {
  const check = worstTag.value
  if (check) remove(check.linked || check.tag)
}

const LEVEL_COLOR = { good: 'success', warning: 'warning', error: 'error' } as const
function reasons(check: Pick<TagCheck, 'codes'> & { linked?: string }): string[] {
  if (!check.codes.length) return [t('hashtags.code.ok')]
  return check.codes.map(code => code === 'invalidChars' && !check.linked ? t('hashtags.code.invalidCharsNone') : t(`hashtags.code.${code}`, { linked: check.linked ?? '' }))
}

function add(tag: string) {
  caption.value = insertTags(caption.value, [tag])
}
function remove(tag: string) {
  caption.value = removeTag(caption.value, tag)
}
function toggle(tag: string) {
  if (inCaption.value.has(normalizeTag(tag))) remove(tag)
  else add(tag)
}
function makeThreadsVersion() {
  emit('threadsVersion', keepTags(caption.value, 1))
  toast.add({ title: t('hashtags.threadsVersionDone'), color: 'success' })
}

const open = ref(false)
const tab = ref<'suggest' | 'research' | 'sets'>('suggest')
const tabs = computed(() => (['suggest', 'research', 'sets'] as const).map(value => ({ value, label: t(`hashtags.tabs.${value}`) })))

// Ideas from the list: free, computed here from the cached list.
const suggestions = computed(() => suggestFromLibrary(settled.value, library.value ?? [], { platforms: props.platforms, limit: 15 }))
// Before any caption, the workspace niche (Pengaturan) seeds the list so the first tap is already useful.
const niche = ref<TagNiche | null>(null)
let nicheLoaded = false
watch(open, async (isOpen) => {
  if (!isOpen || nicheLoaded) return
  nicheLoaded = true
  const settings = await apiFetch<{ niche: string | null }>('/api/app/settings').catch(() => null)
  niche.value = matchNiche(settings?.niche)
})
const nicheTags = computed(() => niche.value ? nicheSuggestions(library.value ?? [], niche.value, props.platforms) : [])
const own = ref('')
const ownCheck = computed(() => {
  const tag = own.value.trim().replace(/^#+/, '')
  return tag ? checkTags({ tags: [tag], caption: caption.value, platforms: [], library: library.value ?? [] }).tags[0]! : null
})
function addOwn() {
  if (!ownCheck.value || ownCheck.value.level === 'error') return
  add(ownCheck.value.tag)
  toast.add({ title: t('hashtags.added', { tag: ownCheck.value.tag }), color: 'success' })
  own.value = ''
}

// Research: paid, runs on the server; Threads numbers arrive a few seconds later.
const research = ref<ResearchView | null>(null)
const researching = ref(false)
const researchLocked = computed(() => entitlements.limit('tagResearchPerMonth') === 0)
const researchLeft = computed(() => entitlements.remaining('tagResearchPerMonth'))
let poll: ReturnType<typeof setTimeout> | undefined
onScopeDispose(() => {
  clearTimeout(poll)
  clearTimeout(settle)
})

async function runResearch() {
  if (researchLocked.value) return entitlements.upgradeRequired(null, t('hashtags.research.locked'))
  researching.value = true
  clearTimeout(poll)
  try {
    research.value = await apiFetch<ResearchView>('/api/app/hashtags/research', { method: 'POST', body: { caption: caption.value, platforms: props.platforms, extraTags: [] } })
    await entitlements.load(true)
    if (research.value.status === 'pending') schedulePoll(0)
  } catch (caught) {
    if (!entitlements.handlePlanError(caught)) toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    researching.value = false
  }
}
function schedulePoll(round: number) {
  if (round >= 10 || !research.value) return
  poll = setTimeout(async () => {
    const id = research.value?.runId
    if (!id) return
    const next = await apiFetch<ResearchView>(`/api/app/hashtags/research/${id}`).catch(() => null)
    if (next && research.value?.runId === id) research.value = next
    if (next?.status === 'pending') schedulePoll(round + 1)
  }, 2_500)
}
const PERFORMANCE_COLOR = { better: 'success', average: 'neutral', worse: 'warning', notEnoughData: 'neutral' } as const

// Saved sets: free.
const sets = ref<HashtagSet[] | null>(null)
const setName = ref('')
const savingSet = ref(false)
async function loadSets() {
  sets.value = (await apiFetch<{ items: HashtagSet[] }>('/api/app/hashtag-sets').catch(() => ({ items: [] }))).items
}
watch([open, tab], ([isOpen, current]) => {
  if (isOpen && current === 'sets' && !sets.value) loadSets()
})
function useSet(set: HashtagSet) {
  caption.value = insertTags(caption.value, set.tags)
}
async function saveSet() {
  savingSet.value = true
  try {
    await apiFetch('/api/app/hashtag-sets', { method: 'POST', body: { name: setName.value, tags: extractTags(caption.value) } })
    toast.add({ title: t('hashtags.sets.saved'), color: 'success' })
    setName.value = ''
    await loadSets()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    savingSet.value = false
  }
}
async function deleteSet(set: HashtagSet) {
  await apiFetch(`/api/app/hashtag-sets/${set.id}`, { method: 'DELETE' })
  toast.add({ title: t('hashtags.sets.deleted'), color: 'success' })
  await loadSets()
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="quality.tags.length"
      class="flex flex-wrap gap-1.5"
    >
      <UPopover
        v-for="(check, index) in quality.tags"
        :key="`${check.tag}-${index}`"
        :content="{ align: 'start', collisionPadding: 12 }"
      >
        <UButton
          size="xs"
          :color="LEVEL_COLOR[check.level]"
          variant="subtle"
          :icon="check.level === 'good' ? 'i-lucide-check' : 'i-lucide-alert-triangle'"
          :label="`#${check.tag}`"
          :aria-label="`#${check.tag}: ${t(`hashtags.level.${check.level}`)}`"
        />
        <template #content>
          <div class="p-3 max-w-72 space-y-2">
            <p class="text-sm font-medium">
              #{{ check.tag }} · {{ t(`hashtags.level.${check.level}`) }}
            </p>
            <ul class="text-sm text-muted space-y-1">
              <li
                v-for="line in reasons(check)"
                :key="line"
              >
                {{ line }}
              </li>
            </ul>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-x"
              :label="t('hashtags.remove')"
              @click="remove(check.linked || check.tag)"
            />
          </div>
        </template>
      </UPopover>
    </div>

    <ul
      v-if="quality.issues.length"
      class="space-y-1 text-xs"
    >
      <li
        v-for="issue in quality.issues"
        :key="issue.code"
        class="flex flex-wrap items-center gap-2"
        :class="issueColor(issue)"
      >
        <span>{{ t(`hashtags.setCode.${issue.code}`, issue.params ?? {}) }}</span>
        <UButton
          v-if="issue.code === 'overLimit' && worstTag"
          size="xs"
          color="warning"
          variant="solid"
          icon="i-lucide-x"
          :label="t('hashtags.dropTag', { tag: worstTag.tag })"
          @click="dropWorst"
        />
        <UButton
          v-if="issue.code === 'threadsOneTag'"
          size="xs"
          variant="link"
          class="p-0"
          :label="t('hashtags.threadsVersion')"
          @click="makeThreadsVersion"
        />
      </li>
    </ul>

    <UButton
      size="xs"
      variant="soft"
      icon="i-lucide-hash"
      :label="t('hashtags.button')"
      @click="open = true"
    />

    <USlideover
      v-model:open="open"
      :title="t('hashtags.title')"
      :description="t('hashtags.description')"
    >
      <template #body>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <UTabs
              v-model="tab"
              :items="tabs"
              :content="false"
              size="sm"
            />
            <span
              v-if="limit !== undefined"
              class="text-xs"
              :class="inCaption.size > limit ? (attempted ? 'text-error' : 'text-warning') : 'text-muted'"
            >
              {{ t('hashtags.count', { count: inCaption.size, max: limit }) }}
              <template v-if="limitPlatform">{{ t('hashtags.countFor', { platform: PLATFORM_META[limitPlatform].name }) }}</template>
            </span>
          </div>

          <div
            v-if="tab === 'suggest'"
            class="space-y-4"
          >
            <form
              class="space-y-1"
              @submit.prevent="addOwn"
            >
              <UFormField :label="t('hashtags.addOwn')">
                <div class="flex gap-2">
                  <UInput
                    v-model="own"
                    icon="i-lucide-hash"
                    :placeholder="t('hashtags.addOwnPlaceholder')"
                    class="flex-1"
                  />
                  <UButton
                    type="submit"
                    :disabled="!ownCheck || ownCheck.level === 'error'"
                    :label="t('hashtags.add')"
                  />
                </div>
              </UFormField>
              <p
                v-if="ownCheck"
                class="text-xs"
                :class="ownCheck.level === 'good' ? 'text-success' : ownCheck.level === 'error' ? 'text-error' : 'text-warning'"
              >
                {{ reasons(ownCheck).join(' ') }}
              </p>
            </form>

            <div v-if="!caption.trim() && nicheTags.length">
              <p class="text-xs text-muted mb-2">
                {{ t('hashtags.nicheHint') }}
              </p>
              <TransitionGroup
                name="list"
                tag="div"
                class="flex flex-wrap gap-2"
              >
                <UButton
                  v-for="tag in nicheTags"
                  :key="tag"
                  size="sm"
                  :color="inCaption.has(tag) ? 'primary' : 'neutral'"
                  :variant="inCaption.has(tag) ? 'solid' : 'outline'"
                  :icon="inCaption.has(tag) ? 'i-lucide-check' : 'i-lucide-plus'"
                  :label="`#${tag}`"
                  :aria-pressed="inCaption.has(tag)"
                  @click="toggle(tag)"
                />
              </TransitionGroup>
            </div>
            <p
              v-else-if="!caption.trim()"
              class="text-sm text-muted"
            >
              {{ t('hashtags.emptyCaption') }}
            </p>
            <p
              v-else-if="!suggestions.length"
              class="text-sm text-muted"
            >
              {{ t('hashtags.noSuggestions') }}
            </p>
            <div v-else>
              <p class="text-xs text-muted mb-2">
                {{ t('hashtags.suggestionsHint') }}
              </p>
              <TransitionGroup
                name="list"
                tag="div"
                class="flex flex-wrap gap-2"
              >
                <UButton
                  v-for="s in suggestions"
                  :key="s.tag"
                  size="sm"
                  :color="inCaption.has(s.tag) ? 'primary' : 'neutral'"
                  :variant="inCaption.has(s.tag) ? 'solid' : 'outline'"
                  :icon="inCaption.has(s.tag) ? 'i-lucide-check' : 'i-lucide-plus'"
                  :label="`#${s.tag}`"
                  :aria-pressed="inCaption.has(s.tag)"
                  @click="toggle(s.tag)"
                />
              </TransitionGroup>
            </div>
          </div>

          <div
            v-else-if="tab === 'research'"
            class="space-y-4"
          >
            <p class="text-sm text-muted">
              {{ t('hashtags.research.intro') }}
            </p>
            <UAlert
              v-if="researchLocked"
              color="primary"
              variant="subtle"
              icon="i-lucide-lock"
              :title="t('hashtags.research.locked')"
              :actions="[{ label: t('upgrade.seePlans'), onClick: () => entitlements.upgradeRequired(null, t('hashtags.research.locked')) }]"
            />
            <template v-else>
              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  icon="i-lucide-sparkles"
                  :loading="researching"
                  :disabled="!caption.trim()"
                  :label="research ? t('hashtags.research.again') : t('hashtags.research.run')"
                  @click="runResearch"
                />
                <span class="text-xs text-muted">
                  {{ researchLeft === Infinity ? t('hashtags.research.unlimited') : t('hashtags.research.remaining', { count: researchLeft }) }}
                </span>
              </div>
              <p
                v-if="!caption.trim()"
                class="text-sm text-muted"
              >
                {{ t('hashtags.research.needCaption') }}
              </p>
            </template>

            <template v-if="research">
              <p
                v-if="research.threads === 'pending'"
                class="text-xs text-muted flex items-center gap-1.5"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-3.5 motion-safe:animate-spin"
                />
                {{ t('hashtags.research.pending') }}
              </p>
              <p
                v-else-if="research.threads === 'noAccount' || research.threads === 'needsReconnect'"
                class="text-xs text-muted"
              >
                {{ t(`hashtags.threads.${research.threads}`) }}
              </p>
              <p
                v-if="!research.items.length"
                class="text-sm text-muted"
              >
                {{ t('hashtags.research.empty') }}
              </p>
              <ul
                v-else
                class="divide-y divide-default"
              >
                <li
                  v-for="item in research.items"
                  :key="item.tag"
                  class="py-2.5 flex items-start gap-3"
                >
                  <div class="min-w-0 flex-1 space-y-1">
                    <p class="text-sm font-medium flex items-center gap-1.5">
                      <UIcon
                        :name="item.quality.level === 'good' ? 'i-lucide-circle-check' : 'i-lucide-alert-triangle'"
                        class="size-4 shrink-0"
                        :class="item.quality.level === 'good' ? 'text-success' : item.quality.level === 'error' ? 'text-error' : 'text-warning'"
                      />
                      <span class="truncate">#{{ item.tag }}</span>
                    </p>
                    <div class="flex flex-wrap gap-1">
                      <UBadge
                        v-for="source in item.sources"
                        :key="source"
                        size="sm"
                        color="neutral"
                        variant="outline"
                        :label="t(`hashtags.source.${source}`)"
                      />
                      <UBadge
                        v-if="item.performance"
                        size="sm"
                        :color="PERFORMANCE_COLOR[item.performance.label]"
                        variant="subtle"
                        :label="t(`hashtags.performance.${item.performance.label}`, { posts: item.performance.posts })"
                      />
                      <UBadge
                        v-if="item.activity"
                        size="sm"
                        color="info"
                        variant="subtle"
                        icon="i-simple-icons-threads"
                        :label="t(`hashtags.activity.${activityLevel(item.activity)}`)"
                      />
                    </div>
                    <p
                      v-if="item.quality.codes.length"
                      class="text-xs text-muted"
                    >
                      {{ reasons(item.quality).join(' ') }}
                    </p>
                  </div>
                  <UButton
                    size="sm"
                    :color="inCaption.has(normalizeTag(item.tag)) ? 'primary' : 'neutral'"
                    :variant="inCaption.has(normalizeTag(item.tag)) ? 'solid' : 'outline'"
                    :icon="inCaption.has(normalizeTag(item.tag)) ? 'i-lucide-check' : 'i-lucide-plus'"
                    :disabled="item.quality.level === 'error' && !inCaption.has(normalizeTag(item.tag))"
                    :aria-label="inCaption.has(normalizeTag(item.tag)) ? t('hashtags.remove') : t('hashtags.add')"
                    @click="toggle(item.tag)"
                  />
                </li>
              </ul>
              <p
                v-if="!research.items.some(i => i.performance)"
                class="text-xs text-muted"
              >
                {{ t('hashtags.research.noHistory') }}
              </p>
            </template>
          </div>

          <div
            v-else
            class="space-y-4"
          >
            <form
              v-if="inCaption.size"
              class="flex gap-2 items-end"
              @submit.prevent="saveSet"
            >
              <UFormField
                :label="t('hashtags.sets.saveCurrent')"
                class="flex-1"
              >
                <UInput
                  v-model="setName"
                  :placeholder="t('hashtags.sets.namePlaceholder')"
                  :aria-label="t('hashtags.sets.name')"
                  class="w-full"
                />
              </UFormField>
              <UButton
                type="submit"
                :loading="savingSet"
                :disabled="!setName.trim()"
                :label="t('common.save')"
              />
            </form>
            <USkeleton
              v-if="!sets"
              class="h-24 w-full"
            />
            <p
              v-else-if="!sets.length"
              class="text-sm text-muted"
            >
              {{ t('hashtags.sets.empty') }}
            </p>
            <ul
              v-else
              class="divide-y divide-default"
            >
              <li
                v-for="set in sets"
                :key="set.id"
                class="py-2.5 flex items-start gap-3"
              >
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium">
                    {{ set.name }}
                    <span class="text-xs text-muted font-normal">· {{ t('hashtags.sets.tags', { count: set.tags.length }) }}</span>
                  </p>
                  <p class="text-xs text-muted break-words">
                    {{ set.tags.map(tag => `#${tag}`).join(' ') }}
                  </p>
                </div>
                <UButton
                  size="sm"
                  variant="soft"
                  :label="t('hashtags.sets.use')"
                  @click="useSet(set)"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  :aria-label="t('hashtags.sets.delete')"
                  @click="deleteSet(set)"
                />
              </li>
            </ul>
          </div>

          <p class="text-xs text-dimmed">
            {{ t('hashtags.honest') }}
          </p>
        </div>
      </template>
    </USlideover>
  </div>
</template>
