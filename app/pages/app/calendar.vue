<script setup lang="ts">
import { addDays, DEFAULT_POSTS_PER_WEEK, weekFill, weekStart, type IdeaDetail, type PlannerIdea, type PlannerMoment } from '#shared/utils/planner'
import type { CalendarEntry } from '~/utils/calendar'

/** Kalender = the planner: posts, planned ideas and shopping moments on one calendar, with Bank Ide beside it. */
interface CalendarWindow { items: CalendarEntry[], ideas: PlannerIdea[], moments: PlannerMoment[], postsPerWeek: number, unplannedIdeas: number }
type Mode = 'week' | 'month'

definePageMeta({ layout: 'creator' })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useCreatorAuth()
const planner = usePlanner()
useHead({ title: () => t('calendar.title') })

const tz = computed(() => auth.profile.value?.displayTimezone ?? 'Asia/Jakarta')
const canWrite = computed(() => auth.hasAbility('posts.write'))
const today = zonedParts(new Date(), tz.value).date

// The chosen view is a per-viewer convenience; the page works the same without storage.
const MODE_KEY = 'socialz.calendar.mode'
const mode = ref<Mode>('week')
onMounted(() => {
  try {
    if (localStorage.getItem(MODE_KEY) === 'month') mode.value = 'month'
  } catch { /* storage blocked: keep the default */ }
})
watch(mode, (value) => {
  try {
    localStorage.setItem(MODE_KEY, value)
  } catch { /* ignore */ }
})

// Any day inside the visible week or month; `?day=` (reminders in the bell) opens on that day's week.
const route = useRoute()
const cursor = ref(typeof route.query.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.day) ? route.query.day : today)
const month = computed(() => cursor.value.slice(0, 7))

/** Visible days: the Monday-first week, or the month grid padded with neighbouring days (max 42 < 62). */
const days = computed(() => {
  if (mode.value === 'week') return Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor.value), i))
  const first = weekStart(`${month.value}-01`)
  const nextMonth = addDays(`${month.value}-01`, 32).slice(0, 7)
  const last = addDays(weekStart(addDays(`${nextMonth}-01`, -1)), 6)
  const count = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1
  return Array.from({ length: count }, (_, i) => addDays(first, i))
})

function step(delta: number) {
  if (mode.value === 'week') cursor.value = addDays(weekStart(cursor.value), delta * 7)
  else {
    const [y, m] = month.value.split('-').map(Number) as [number, number]
    cursor.value = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10)
  }
}

const data = shallowRef<CalendarWindow>({ items: [], ideas: [], moments: [], postsPerWeek: DEFAULT_POSTS_PER_WEEK, unplannedIdeas: 0 })
const loading = ref(false)
let sequence = 0
async function load() {
  const current = ++sequence
  loading.value = true
  try {
    const from = toZonedIso(days.value[0]!, '00:00', tz.value)
    const to = toZonedIso(addDays(days.value.at(-1)!, 1), '00:00', tz.value)
    const response = await apiFetch<CalendarWindow>('/api/app/posts/calendar', { query: { from, to } })
    if (current === sequence) data.value = response
  } catch (caught) {
    if (current === sequence) planner.fail(caught)
  } finally {
    if (current === sequence) loading.value = false
  }
}
onMounted(load)
watch(days, load)
// Any write to posts or ideas (here, in Bank Ide, in the editor) redraws the calendar.
const stop = onApiMutation(topic => (topic === '/api/app/planner' || topic === '/api/app/posts') && load())
onBeforeUnmount(stop)

const posts = computed(() => groupPostsByDay(data.value.items, tz.value))
const ideas = computed(() => groupIdeasByDay(data.value.ideas))
const marks = computed(() => momentMarks(data.value.moments, days.value))

const rhythm = computed(() => {
  const filled = new Map<string, number>()
  for (const day of days.value) filled.set(day, (posts.value.get(day)?.length ?? 0) + (ideas.value.get(day)?.length ?? 0))
  return weekFill(days.value, filled, data.value.postsPerWeek, today)
})

const title = computed(() => {
  const format = (options: Intl.DateTimeFormatOptions, day: string) => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
  if (mode.value === 'month') return format({ month: 'long', year: 'numeric' }, `${month.value}-01`)
  const [first, last] = [days.value[0]!, days.value.at(-1)!]
  return `${format({ day: 'numeric', month: 'short' }, first)} – ${format({ day: 'numeric', month: 'short', year: 'numeric' }, last)}`
})
const isCurrent = computed(() => days.value.includes(today) && (mode.value === 'week' || month.value === today.slice(0, 7)))

// Drop on a day: a post keeps its time of day; an idea just moves. Nothing lands in the past.
async function drop(day: string) {
  const item = planner.drag.value
  planner.drag.value = null
  if (!item || !canWrite.value || day < today) return
  if (item.kind === 'idea') return void planner.planIdea(item.id, day)
  try {
    await apiFetch(`/api/app/posts/${item.postId}/reschedule`, { method: 'POST', body: { scheduledAt: toZonedIso(day, item.time, tz.value) } })
    toast.add({ title: t('calendar.moved'), color: 'success' })
  } catch (caught) {
    planner.fail(caught)
  }
}

// "+" on a day: with ideas waiting in Bank Ide, offer them; without, go straight to the composer as before.
const pickDay = ref<string | null>(null)
function fill(day: string) {
  if (data.value.unplannedIdeas > 0) pickDay.value = day
  else navigateTo(localePath({ path: '/app/compose', query: { date: day } }))
}

const editorOpen = ref(false)
const editing = ref<IdeaDetail | null>(null)
const editorDay = ref<string | null>(null)
function newIdea(day: string | null = null) {
  pickDay.value = null
  editing.value = null
  editorDay.value = day
  editorOpen.value = true
}
function openIdea(idea: IdeaDetail) {
  editing.value = idea
  editorDay.value = null
  editorOpen.value = true
}
async function openIdeaById(id: string) {
  try {
    openIdea(await apiFetch<IdeaDetail>(`/api/app/planner/ideas/${id}`))
  } catch (caught) {
    planner.fail(caught)
  }
}

const tab = ref<'calendar' | 'ideas'>('calendar')
const tabs = computed(() => [{ value: 'calendar', label: t('calendar.tabCalendar'), icon: 'i-lucide-calendar' }, { value: 'ideas', label: t('calendar.tabIdeas'), icon: 'i-lucide-lightbulb' }])
</script>

<template>
  <div class="w-full max-w-7xl mx-auto">
    <CommandBar
      :title="t('calendar.title')"
      :description="t('calendar.subtitle')"
    >
      <UButton
        v-if="canWrite"
        icon="i-lucide-lightbulb"
        variant="outline"
        :label="t('planner.idea.new')"
        @click="newIdea()"
      />
    </CommandBar>

    <MomentStrip
      :moments="data.moments"
      :today="today"
    />

    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      size="sm"
      class="lg:hidden mb-4"
    />

    <div class="lg:grid lg:grid-cols-[1fr_20rem] lg:gap-6 items-start">
      <div
        class="min-w-0"
        :class="tab === 'calendar' ? '' : 'hidden lg:block'"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div class="flex items-center gap-1 min-w-0">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              :aria-label="mode === 'week' ? t('calendar.prevWeek') : t('calendar.prev')"
              @click="step(-1)"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              :aria-label="mode === 'week' ? t('calendar.nextWeek') : t('calendar.next')"
              @click="step(1)"
            />
            <h2 class="font-semibold text-highlighted capitalize ml-1 truncate">
              {{ title }}
            </h2>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="!isCurrent"
              size="sm"
              color="neutral"
              variant="outline"
              :label="t('calendar.today')"
              @click="cursor = today"
            />
            <UFieldGroup size="sm">
              <UButton
                :color="mode === 'week' ? 'primary' : 'neutral'"
                :variant="mode === 'week' ? 'solid' : 'outline'"
                :label="t('calendar.viewWeek')"
                @click="mode = 'week'"
              />
              <UButton
                :color="mode === 'month' ? 'primary' : 'neutral'"
                :variant="mode === 'month' ? 'solid' : 'outline'"
                :label="t('calendar.viewMonth')"
                @click="mode = 'month'"
              />
            </UFieldGroup>
          </div>
        </div>

        <WeekRhythm
          v-if="mode === 'week'"
          :count="rhythm.count"
          :target="rhythm.target"
        />

        <div class="hidden md:block">
          <CalendarWeek
            v-if="mode === 'week'"
            :days="days"
            :today="today"
            :posts="posts"
            :ideas="ideas"
            :marks="marks"
            @drop="drop"
            @fill="fill"
            @open-idea="openIdeaById"
          />
          <CalendarMonth
            v-else
            :days="days"
            :month="month"
            :today="today"
            :posts="posts"
            :ideas="ideas"
            :marks="marks"
            @drop="drop"
            @fill="fill"
            @open-idea="openIdeaById"
          />
          <p
            v-if="canWrite"
            class="text-xs text-muted mt-2"
          >
            {{ t('calendar.dragHint') }}
          </p>
        </div>
        <CalendarAgenda
          class="md:hidden"
          :days="mode === 'week' ? days : days.filter(d => d.startsWith(month))"
          :show-empty="mode === 'week'"
          :today="today"
          :loading="loading"
          :posts="posts"
          :ideas="ideas"
          :marks="marks"
          @fill="fill"
          @open-idea="openIdeaById"
        />
      </div>

      <aside
        class="lg:sticky lg:top-4"
        :class="tab === 'ideas' ? '' : 'hidden lg:block'"
      >
        <h2 class="font-semibold text-highlighted mb-3 hidden lg:block">
          {{ t('planner.bank.title') }}
        </h2>
        <IdeaBankPanel @open="openIdea" />
      </aside>
    </div>

    <IdeaEditor
      v-model:open="editorOpen"
      :idea="editing"
      :planned-on="editorDay"
    />
    <IdeaPickDialog
      :day="pickDay"
      @close="pickDay = null"
      @new-idea="newIdea"
    />
  </div>
</template>
