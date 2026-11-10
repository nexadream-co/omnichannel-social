<script setup lang="ts">
import { momentName, type PlannerIdea } from '#shared/utils/planner'
import { dropCellClass, type DayPost, type MomentMark } from '~/utils/calendar'

/** Month view (tablet and desktop): up to three chips a day, posts first, then ideas. */
const props = defineProps<{ days: string[], month: string, today: string, posts: Map<string, DayPost[]>, ideas: Map<string, PlannerIdea[]>, marks: Map<string, MomentMark[]> }>()
const emit = defineEmits<{ drop: [day: string], fill: [day: string], openIdea: [id: string] }>()
const { t, locale } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()
const canWrite = computed(() => auth.hasAbility('posts.write'))
const dnd = usePlannerDrop(() => props.today, day => emit('drop', day))

/** A tap on the empty part of a day opens the create sheet; chips, buttons and drags keep their own behaviour. */
const fillable = (day: string) => canWrite.value && day >= props.today
function tapDay(day: string, event: MouseEvent) {
  if (!fillable(day) || dnd.dragging.value || (event.target as Element).closest('a, button')) return
  emit('fill', day)
}

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
        :class="[day.startsWith(month) ? 'bg-default' : 'bg-muted/40', dropCellClass(dnd.state(day), dnd.settled.value === day), marks.has(day) ? 'border-t-2 border-t-primary/40' : '', fillable(day) && !dnd.dragging.value ? 'group/day cursor-pointer hover:bg-primary/10 hover:ring-1 hover:ring-inset hover:ring-primary/40' : '']"
        :data-drop-day="day"
        @planner-drop="dnd.drop(day)"
        @click="tapDay(day, $event)"
      >
        <div class="flex items-center justify-between gap-1 min-w-0">
          <span
            class="text-xs size-6 flex items-center justify-center rounded-full shrink-0"
            :class="day === today ? 'bg-primary text-inverted font-semibold ring-2 ring-primary/40 ring-offset-1 ring-offset-default motion-safe:animate-pulse' : day.startsWith(month) ? 'text-default' : 'text-dimmed'"
          >{{ Number(day.slice(8)) }}</span>
          <span
            v-for="mark in (marks.get(day) ?? []).filter(m => m.label).slice(0, 1)"
            :key="mark.moment.id"
            class="text-[11px] font-medium text-primary truncate"
          >{{ momentName(mark.moment, locale) }}</span>
          <UButton
            v-if="fillable(day)"
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="ghost"
            class="ml-auto shrink-0 opacity-0 group-hover/day:opacity-100 group-hover/day:text-primary focus-visible:opacity-100 pointer-coarse:opacity-100 motion-safe:transition-opacity"
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
