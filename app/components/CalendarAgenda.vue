<script setup lang="ts">
import { momentName, type PlannerIdea } from '#shared/utils/planner'
import { dropCellClass, type DayPost, type MomentMark } from '~/utils/calendar'

/**
 * Phone: a list of days. Hold a scheduled post or an idea, then drag it onto another day (a hold released in
 * place opens "Pindahkan ke…" for a post). The week shows every day from today on, so empty ones can be filled
 * or dropped on; past days and the month show only days with something on them.
 */
const props = defineProps<{ days: string[], showEmpty: boolean, today: string, loading: boolean, posts: Map<string, DayPost[]>, ideas: Map<string, PlannerIdea[]>, marks: Map<string, MomentMark[]> }>()
const emit = defineEmits<{ fill: [day: string], openIdea: [id: string], movePost: [post: DayPost], drop: [day: string] }>()
const { t, locale } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()
const canWrite = computed(() => auth.hasAbility('posts.write'))
const dnd = usePlannerDrop(() => props.today, day => emit('drop', day))

const listed = computed(() => props.days.filter(day => (props.showEmpty && day >= props.today) || props.posts.has(day) || props.ideas.has(day) || props.marks.has(day)))
</script>

<template>
  <div class="space-y-4">
    <EmptyState
      v-if="!loading && !listed.length"
      icon="i-lucide-calendar-days"
      :title="t('calendar.empty')"
      compact
    />
    <section
      v-for="day in listed"
      :key="day"
      class="rounded-lg -mx-2 px-2 py-1 motion-safe:transition-colors"
      :class="dropCellClass(dnd.state(day), dnd.settled.value === day)"
      :data-drop-day="day"
      @planner-drop="dnd.drop(day)"
    >
      <div class="flex items-center gap-2 mb-2">
        <h3
          class="text-sm font-semibold"
          :class="day === today ? 'text-primary' : day < today ? 'text-muted' : 'text-highlighted'"
        >
          {{ planner.dayLabel(day) }}
        </h3>
        <UBadge
          v-for="mark in marks.get(day) ?? []"
          :key="mark.moment.id"
          size="sm"
          variant="subtle"
          :label="momentName(mark.moment, locale)"
        />
      </div>
      <ul class="space-y-2">
        <li
          v-for="post in posts.get(day) ?? []"
          :key="post.postId"
        >
          <CalendarAgendaPost
            :post="post"
            @move="emit('movePost', $event)"
          />
        </li>
        <li
          v-for="idea in ideas.get(day) ?? []"
          :key="idea.id"
        >
          <CalendarAgendaIdea
            :idea="idea"
            @open="emit('openIdea', $event)"
          />
        </li>
        <li
          v-if="dnd.state(day) === 'ok'"
          class="rounded-md border border-dashed border-primary/60 p-3 text-center text-sm text-primary"
        >
          {{ t('calendar.dropHere') }}
        </li>
        <li v-else-if="canWrite && day >= today && !posts.has(day) && !ideas.has(day)">
          <button
            type="button"
            class="w-full flex items-center gap-2 rounded-md border border-dashed border-default p-3 text-sm text-muted"
            @click="emit('fill', day)"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-4"
            />
            {{ t('planner.rhythm.fill') }}
          </button>
        </li>
        <li
          v-else-if="!posts.has(day) && !ideas.has(day)"
          class="text-sm text-dimmed px-1"
        >
          {{ t('calendar.emptyDay') }}
        </li>
      </ul>
    </section>
  </div>
</template>
