<script setup lang="ts">
import { IDEA_NOTE_MAX, IDEA_TITLE_MAX } from '#shared/utils/planner'

/**
 * Beranda "Lagi rame" (ARCHITECTURE §8.9): today's or this week's top news, Indonesia or worldwide, as content
 * inspiration. "Jadikan ide" drops a headline into Bank Ide with its source and link in the note. Hidden when the
 * back-office turns it off.
 */
interface NewsItem { id: string, title: string, source: string | null, url: string, publishedAt: string | null, firstSeenAt: string, hot: boolean }
type Region = 'id' | 'world'
type Range = 'today' | 'week'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const toast = useToast()

const canWrite = computed(() => auth.hasAbility('posts.write'))
const region = ref<Region>('id')
const range = ref<Range>('today')
const regions = computed(() => [{ value: 'id' as const, label: t('news.region.id') }, { value: 'world' as const, label: t('news.region.world') }])
const ranges = computed(() => [{ value: 'today' as const, label: t('news.range.today') }, { value: 'week' as const, label: t('news.range.week') }])

const { data, status } = useAsyncData(
  'home-news',
  () => apiFetch<{ enabled: boolean, items: NewsItem[] }>('/api/app/news', { query: { region: region.value, range: range.value } }),
  { server: false, watch: [region, range] }
)
const enabled = computed(() => data.value?.enabled !== false)
const items = computed(() => data.value?.items ?? [])

const added = ref(new Set<string>())
const adding = ref<string | null>(null)
async function makeIdea(item: NewsItem) {
  adding.value = item.id
  try {
    const note = [t('news.ideaNote', { source: item.source ?? t('news.sourceUnknown') }), item.url].join('\n').slice(0, IDEA_NOTE_MAX)
    await apiFetch('/api/app/planner/ideas', { method: 'POST', body: { title: item.title.slice(0, IDEA_TITLE_MAX), note } })
    added.value = new Set(added.value).add(item.id)
    toast.add({ title: t('news.ideaAdded'), icon: 'i-lucide-lightbulb', color: 'success', actions: [{ label: t('news.openIdeas'), to: localePath('/app/ideas') }] })
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  } finally {
    adding.value = null
  }
}

const when = (item: NewsItem) => formatRelative(item.publishedAt ?? item.firstSeenAt, locale.value)
</script>

<template>
  <UCard
    v-if="enabled"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon
            name="i-lucide-flame"
            class="size-5 text-primary"
          />
          {{ t('news.title') }}
        </h2>
        <div
          class="flex rounded-full bg-elevated p-0.5 text-xs"
          role="group"
          :aria-label="t('news.rangeLabel')"
        >
          <button
            v-for="option in ranges"
            :key="option.value"
            type="button"
            class="rounded-full px-2.5 py-1 font-medium motion-safe:transition-colors"
            :class="range === option.value ? 'bg-default text-highlighted shadow-sm' : 'text-muted hover:text-default'"
            :aria-pressed="range === option.value"
            @click="range = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div
        class="mt-3 flex gap-1.5"
        role="group"
        :aria-label="t('news.regionLabel')"
      >
        <UButton
          v-for="option in regions"
          :key="option.value"
          :label="option.label"
          size="xs"
          :color="region === option.value ? 'primary' : 'neutral'"
          :variant="region === option.value ? 'soft' : 'ghost'"
          class="rounded-full"
          :aria-pressed="region === option.value"
          @click="region = option.value"
        />
      </div>
    </template>

    <div
      v-if="status === 'pending' && !items.length"
      class="space-y-3 p-4"
    >
      <USkeleton
        v-for="n in 4"
        :key="n"
        class="h-10 w-full"
      />
    </div>
    <p
      v-else-if="!items.length"
      class="p-4 text-sm text-muted"
    >
      {{ t('news.empty') }}
    </p>
    <ul
      v-else
      class="divide-y divide-default"
    >
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="flex items-start gap-3 px-4 py-3"
      >
        <span
          class="mt-0.5 w-4 shrink-0 text-sm font-semibold tabular-nums"
          :class="index < 3 ? 'text-primary' : 'text-dimmed'"
        >{{ index + 1 }}</span>
        <div class="min-w-0 flex-1">
          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="line-clamp-2 text-sm font-medium text-highlighted hover:text-primary hover:underline"
          >{{ item.title }}</a>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span
              v-if="item.source"
              class="truncate max-w-40"
            >{{ item.source }}</span>
            <span v-if="item.source">·</span>
            <span>{{ when(item) }}</span>
            <template v-if="range === 'week' && item.hot">
              <span>·</span>
              <span class="inline-flex items-center gap-1 text-primary">
                <span
                  class="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
                  aria-hidden="true"
                />
                {{ t('news.stillHot') }}
              </span>
            </template>
          </p>
        </div>
        <UButton
          v-if="canWrite"
          :icon="added.has(item.id) ? 'i-lucide-check' : 'i-lucide-lightbulb'"
          :label="added.has(item.id) ? t('news.added') : t('news.makeIdea')"
          :loading="adding === item.id"
          :disabled="added.has(item.id)"
          size="xs"
          :color="added.has(item.id) ? 'success' : 'neutral'"
          variant="soft"
          class="shrink-0"
          @click="makeIdea(item)"
        />
      </li>
    </ul>
    <template #footer>
      <p class="text-xs text-dimmed">
        {{ t('news.footer') }}
      </p>
    </template>
  </UCard>
</template>
