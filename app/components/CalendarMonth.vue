<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import { momentName, type PlannerIdea } from '#shared/utils/planner'
import { dayPlatforms, type DayPost, type MomentMark } from '~/utils/calendar'

/** Month view (tablet and desktop): up to three chips a day, posts first, then ideas. */
const props = defineProps<{ days: string[], month: string, today: string, posts: Map<string, DayPost[]>, ideas: Map<string, PlannerIdea[]>, marks: Map<string, MomentMark[]> }>()
const emit = defineEmits<{ drop: [day: string], fill: [day: string], openIdea: [id: string] }>()
const { t, locale } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()
const canWrite = computed(() => auth.hasAbility('posts.write'))
const dnd = usePlannerDrop(() => props.today, day => emit('drop', day))

const SHOWN = 3
const weekdays = computed(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + i)))))
function chips(day: string) {
  const posts = props.posts.get(day) ?? []
  const ideas = props.ideas.get(day) ?? []
  const shownPosts = posts.slice(0, SHOWN)
  const shownIdeas = ideas.slice(0, SHOWN - shownPosts.length)
  return { posts: shownPosts, ideas: shownIdeas, more: posts.length + ideas.length - shownPosts.length - shownIdeas.length }
}
</script>

<template>
  <div>
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
        v-for="day in days"
        :key="day"
        class="min-h-28 motion-safe:transition-colors border-r border-b border-default p-1.5 flex flex-col gap-1"
        :class="[day.startsWith(month) ? 'bg-default' : 'bg-muted/40', dnd.state(day) === 'ok' ? 'bg-primary/10' : dnd.state(day) === 'past' ? 'animate-shake' : '', dnd.settled.value === day ? 'ring-2 ring-inset ring-primary/40' : '', marks.has(day) ? 'border-t-2 border-t-primary/40' : '']"
        @dragover="dnd.dragover(day, $event)"
        @drop.prevent="dnd.drop(day)"
      >
        <div class="flex items-center justify-between gap-1 min-w-0">
          <span
            class="text-xs size-6 flex items-center justify-center rounded-full shrink-0"
            :class="day === today ? 'bg-primary text-inverted font-semibold ring-2 ring-primary/40 ring-offset-1 ring-offset-default motion-safe:animate-pulse' : day.startsWith(month) ? 'text-default' : 'text-dimmed'"
          >{{ Number(day.slice(8)) }}</span>
          <span
            v-if="dayPlatforms(posts.get(day) ?? []).shown.length"
            class="flex items-center gap-0.5 min-w-0"
            aria-hidden="true"
          >
            <UIcon
              v-for="p in dayPlatforms(posts.get(day) ?? []).shown"
              :key="p"
              :name="PLATFORM_META[p].icon"
              class="size-2.5 text-muted"
            />
            <span
              v-if="dayPlatforms(posts.get(day) ?? []).more"
              class="text-[10px] text-muted"
            >+{{ dayPlatforms(posts.get(day) ?? []).more }}</span>
          </span>
          <span
            v-for="mark in (marks.get(day) ?? []).filter(m => m.label).slice(0, 1)"
            :key="mark.moment.id"
            class="text-[11px] font-medium text-primary truncate"
          >{{ momentName(mark.moment, locale) }}</span>
          <UButton
            v-if="canWrite && day >= today"
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="ghost"
            class="ml-auto opacity-0 hover:opacity-100 focus-visible:opacity-100 shrink-0"
            :aria-label="t('planner.pick.title', { date: planner.dayLabel(day) })"
            @click="emit('fill', day)"
          />
        </div>
        <p
          v-if="dnd.state(day) === 'ok'"
          class="rounded border border-dashed border-primary/50 px-1.5 py-2 text-center text-[11px] text-primary"
        >
          {{ t('calendar.dropHere') }}
        </p>
        <p
          v-else-if="dnd.state(day) === 'past'"
          class="text-[11px] leading-tight text-error text-center"
          role="status"
        >
          {{ t('calendar.dropPast') }}
        </p>
        <CalendarPostChip
          v-for="post in chips(day).posts"
          :key="post.postId"
          :post="post"
        />
        <IdeaChip
          v-for="idea in chips(day).ideas"
          :key="idea.id"
          :idea="idea"
          @open="emit('openIdea', $event)"
        />
        <span
          v-if="chips(day).more > 0"
          class="text-xs text-muted px-1"
        >{{ t('calendar.more', { n: chips(day).more }) }}</span>
      </div>
    </div>
  </div>
</template>
