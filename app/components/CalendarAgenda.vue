<script setup lang="ts">
import { momentName, PILLAR_META, type PlannerIdea } from '#shared/utils/planner'
import type { DayPost, MomentMark } from '~/utils/calendar'

/**
 * Phone: a list of days; long-press a scheduled post to move it. The week shows every day from today on, so empty
 * ones can be filled; past days and the month show only days with something on them.
 */
const props = defineProps<{ days: string[], showEmpty: boolean, today: string, loading: boolean, posts: Map<string, DayPost[]>, ideas: Map<string, PlannerIdea[]>, marks: Map<string, MomentMark[]> }>()
const emit = defineEmits<{ fill: [day: string], openIdea: [id: string], movePost: [post: DayPost] }>()
const { t, locale } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()
const canWrite = computed(() => auth.hasAbility('posts.write'))

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
          <button
            type="button"
            class="w-full text-left flex items-center gap-3 rounded-md border border-dashed border-accented p-3"
            @click="emit('openIdea', idea.id)"
          >
            <UIcon
              :name="idea.pillar ? PILLAR_META[idea.pillar].icon : 'i-lucide-lightbulb'"
              class="size-4 text-muted shrink-0"
            />
            <span class="text-sm truncate flex-1">{{ idea.title }}</span>
            <span class="text-xs text-muted shrink-0">{{ t('planner.idea.chip') }}</span>
          </button>
        </li>
        <li v-if="canWrite && day >= today && !posts.has(day) && !ideas.has(day)">
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
