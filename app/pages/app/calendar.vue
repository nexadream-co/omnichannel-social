<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'

interface Entry { id: string, postId: string, platform: Platform, status: string, scheduledAt: string, removedAt: string | null, caption: string }
/** `removed`: platforms where the published post was later deleted (found by a sync). */
interface DayPost { postId: string, time: string, caption: string, platforms: Platform[], removed: Platform[], status: string }

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useCreatorAuth()
useHead({ title: () => t('calendar.title') })

const tz = computed(() => auth.profile.value?.displayTimezone ?? 'Asia/Jakarta')
const canWrite = computed(() => auth.hasAbility('posts.write'))
const today = zonedParts(new Date(), tz.value).date
const month = ref(today.slice(0, 7)) // 'YYYY-MM' on the workspace clock
const entries = shallowRef<Entry[]>([])
const loading = ref(false)

function addMonths(value: string, delta: number) {
  const [y, m] = value.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

async function load() {
  loading.value = true
  const from = toZonedIso(`${month.value}-01`, '00:00', tz.value)
  const to = toZonedIso(`${addMonths(month.value, 1)}-01`, '00:00', tz.value)
  entries.value = (await apiFetch<{ items: Entry[] }>('/api/app/posts/calendar', { query: { from, to } })).items
  loading.value = false
}
onMounted(load)
watch(month, load)

/** One chip per post per day (targets of the same post are grouped). */
const byDay = computed(() => {
  const map = new Map<string, DayPost[]>()
  for (const entry of entries.value) {
    const { date, time } = zonedParts(new Date(entry.scheduledAt), tz.value)
    const list = map.get(date) ?? []
    const existing = list.find(p => p.postId === entry.postId)
    const removed = entry.removedAt ? [entry.platform] : []
    if (existing) {
      existing.platforms.push(entry.platform)
      existing.removed.push(...removed)
      if (entry.status === 'failed') existing.status = 'failed'
    } else {
      list.push({ postId: entry.postId, time, caption: entry.caption, platforms: [entry.platform], removed, status: entry.status })
    }
    map.set(date, list)
  }
  return map
})

const weekdays = computed(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + i)))))
const monthLabel = computed(() => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month.value}-01T00:00:00Z`)))

/** Monday-first grid of the month, padded with neighbouring days. */
const cells = computed(() => {
  const first = new Date(`${month.value}-01T00:00:00Z`)
  const lead = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const total = Math.ceil((lead + days) / 7) * 7
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(first.getTime() + (i - lead) * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    return { key, day: d.getUTCDate(), inMonth: key.startsWith(month.value), isToday: key === today, past: key < today }
  })
})

const listDays = computed(() => [...byDay.value.entries()].sort(([a], [b]) => a.localeCompare(b)))
const STATUS_DOT: Record<string, string> = { published: 'bg-success', failed: 'bg-error', scheduled: 'bg-info', draft: 'bg-muted' }
const dot = (status: string) => STATUS_DOT[status] ?? 'bg-warning'
const allRemoved = (post: DayPost) => post.removed.length > 0 && new Set(post.removed).size === new Set(post.platforms).size
const removedLabel = (p: Platform) => t('posts.removedOn', { platform: PLATFORM_META[p].name })

// Drag to reschedule (desktop): keep the time of day, move the date.
const dragging = ref<DayPost | null>(null)
async function drop(dayKey: string) {
  const post = dragging.value
  dragging.value = null
  if (!post || !canWrite.value || post.status !== 'scheduled' || dayKey < today) return
  try {
    await apiFetch(`/api/app/posts/${post.postId}/reschedule`, { method: 'POST', body: { scheduledAt: toZonedIso(dayKey, post.time, tz.value) } })
    toast.add({ title: t('calendar.moved'), color: 'success' })
    await load()
  } catch (caught) {
    toast.add({ title: extractErrorMessage(caught, t('authError.generic')), color: 'error' })
  }
}

function dayLabel(key: string) {
  return formatDate(`${key}T12:00:00Z`, { locale: locale.value, timeZone: 'UTC' })
}
</script>

<template>
  <div class="w-full max-w-6xl mx-auto">
    <CommandBar
      :title="t('calendar.title')"
      :description="t('calendar.subtitle')"
    />
    <div class="flex items-center justify-between gap-2 mb-4">
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          :aria-label="t('calendar.prev')"
          @click="month = addMonths(month, -1)"
        />
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          :aria-label="t('calendar.next')"
          @click="month = addMonths(month, 1)"
        />
        <h2 class="font-semibold text-highlighted capitalize ml-1">
          {{ monthLabel }}
        </h2>
      </div>
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :label="t('calendar.today')"
        @click="month = today.slice(0, 7)"
      />
    </div>

    <!-- Desktop / tablet: month grid with drag to reschedule -->
    <div class="hidden md:block">
      <div class="grid grid-cols-7 text-xs text-muted mb-1">
        <div
          v-for="w in weekdays"
          :key="w"
          class="px-2 py-1 capitalize"
        >
          {{ w }}
        </div>
      </div>
      <div class="grid grid-cols-7 border-t border-l border-default rounded-md overflow-hidden">
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="min-h-28 border-r border-b border-default p-1.5 flex flex-col gap-1"
          :class="[cell.inMonth ? 'bg-default' : 'bg-muted/40', dragging && !cell.past ? 'hover:bg-primary/5' : '']"
          @dragover.prevent
          @drop="drop(cell.key)"
        >
          <div class="flex items-center justify-between">
            <span
              class="text-xs size-6 flex items-center justify-center rounded-full"
              :class="cell.isToday ? 'bg-primary text-inverted font-semibold' : cell.inMonth ? 'text-default' : 'text-dimmed'"
            >{{ cell.day }}</span>
            <UButton
              v-if="canWrite && !cell.past"
              :to="localePath({ path: '/app/compose', query: { date: cell.key } })"
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="ghost"
              class="opacity-0 hover:opacity-100 focus-visible:opacity-100"
              :aria-label="t('posts.create')"
            />
          </div>
          <NuxtLink
            v-for="post in (byDay.get(cell.key) ?? []).slice(0, 3)"
            :key="post.postId"
            :to="localePath(`/app/posts/${post.postId}`)"
            :draggable="canWrite && post.status === 'scheduled'"
            class="text-xs rounded px-1.5 py-1 bg-elevated hover:bg-accented/50 flex items-center gap-1 min-w-0"
            @dragstart="dragging = post"
          >
            <span
              class="size-1.5 rounded-full shrink-0"
              :class="dot(post.status)"
            />
            <span class="text-muted shrink-0">{{ post.time }}</span>
            <UIcon
              v-for="p in [...new Set(post.platforms)]"
              :key="p"
              :name="PLATFORM_META[p].icon"
              class="size-3 shrink-0"
              :class="post.removed.includes(p) ? 'opacity-40' : ''"
              :title="post.removed.includes(p) ? removedLabel(p) : undefined"
            />
            <span
              class="truncate"
              :class="allRemoved(post) ? 'line-through text-muted' : ''"
            >{{ post.caption || t('posts.noCaption') }}</span>
          </NuxtLink>
          <span
            v-if="(byDay.get(cell.key)?.length ?? 0) > 3"
            class="text-xs text-muted px-1"
          >{{ t('calendar.more', { n: byDay.get(cell.key)!.length - 3 }) }}</span>
        </div>
      </div>
      <p
        v-if="canWrite"
        class="text-xs text-muted mt-2"
      >
        {{ t('calendar.dragHint') }}
      </p>
    </div>

    <!-- Phone: list grouped by day -->
    <div class="md:hidden space-y-4">
      <p
        v-if="!loading && !listDays.length"
        class="text-center text-muted py-10"
      >
        {{ t('calendar.empty') }}
      </p>
      <section
        v-for="[day, posts] in listDays"
        :key="day"
      >
        <h3
          class="text-sm font-semibold mb-2"
          :class="day === today ? 'text-primary' : 'text-highlighted'"
        >
          {{ dayLabel(day) }}
        </h3>
        <ul class="space-y-2">
          <li
            v-for="post in posts"
            :key="post.postId"
          >
            <NuxtLink
              :to="localePath(`/app/posts/${post.postId}`)"
              class="flex items-center gap-3 rounded-md border border-default bg-default p-3"
            >
              <span
                class="size-2 rounded-full shrink-0"
                :class="dot(post.status)"
              />
              <span class="text-sm text-muted w-12 shrink-0">{{ post.time }}</span>
              <span class="flex gap-1 shrink-0">
                <UIcon
                  v-for="p in [...new Set(post.platforms)]"
                  :key="p"
                  :name="PLATFORM_META[p].icon"
                  class="size-4"
                  :class="post.removed.includes(p) ? 'opacity-40' : ''"
                />
              </span>
              <span
                class="text-sm truncate flex-1"
                :class="allRemoved(post) ? 'line-through text-muted' : ''"
              >{{ post.caption || t('posts.noCaption') }}</span>
              <UBadge
                v-for="p in [...new Set(post.removed)]"
                :key="p"
                color="neutral"
                variant="subtle"
                size="sm"
                :label="removedLabel(p)"
                class="shrink-0"
              />
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
