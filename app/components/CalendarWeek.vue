<script setup lang="ts">
import { momentName, type PlannerIdea } from '#shared/utils/planner'
import type { DayPost, MomentMark } from '~/utils/calendar'

/** Week view (tablet and desktop): every post and idea of each day, and "Isi" on empty days ahead. */
const props = defineProps<{ days: string[], today: string, posts: Map<string, DayPost[]>, ideas: Map<string, PlannerIdea[]>, marks: Map<string, MomentMark[]> }>()
const emit = defineEmits<{ drop: [day: string], fill: [day: string], openIdea: [id: string] }>()
const { t, locale } = useI18n()
const auth = useCreatorAuth()
const planner = usePlanner()
const canWrite = computed(() => auth.hasAbility('posts.write'))
const dnd = usePlannerDrop(() => props.today, day => emit('drop', day))

const weekday = (day: string) => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'id-ID', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
</script>

<template>
  <div class="grid grid-cols-7 border-t border-l border-default rounded-md overflow-hidden">
    <div
      v-for="day in days"
      :key="day"
      class="min-h-72 motion-safe:transition-colors border-r border-b border-default p-1.5 flex flex-col gap-1 bg-default"
      :class="[day < today ? 'bg-muted/40' : '', dnd.state(day) === 'ok' ? 'bg-primary/10' : dnd.state(day) === 'past' ? 'animate-shake' : '', dnd.settled.value === day ? 'ring-2 ring-inset ring-primary/40' : '', marks.has(day) ? 'border-t-2 border-t-primary/40' : '']"
      @dragover="dnd.dragover(day, $event)"
      @drop.prevent="dnd.drop(day)"
    >
      <div class="flex items-center gap-1.5 mb-1">
        <span class="text-xs text-muted capitalize">{{ weekday(day) }}</span>
        <span
          class="text-xs size-6 flex items-center justify-center rounded-full"
          :class="day === today ? 'bg-primary text-inverted font-semibold' : 'text-default'"
        >{{ Number(day.slice(8)) }}</span>
      </div>
      <template
        v-for="mark in marks.get(day) ?? []"
        :key="mark.moment.id"
      >
        <span
          v-if="mark.label"
          class="text-[11px] leading-tight font-medium text-primary truncate"
        >{{ momentName(mark.moment, locale) }}</span>
      </template>
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
        v-for="post in posts.get(day) ?? []"
        :key="post.postId"
        :post="post"
        wrap
      />
      <IdeaChip
        v-for="idea in ideas.get(day) ?? []"
        :key="idea.id"
        :idea="idea"
        wrap
        @open="emit('openIdea', $event)"
      />
      <UButton
        v-if="canWrite && day >= today"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-plus"
        :label="posts.get(day)?.length || ideas.get(day)?.length ? undefined : t('planner.rhythm.fill')"
        :aria-label="t('planner.pick.title', { date: planner.dayLabel(day) })"
        class="mt-auto self-start"
        @click="emit('fill', day)"
      />
    </div>
  </div>
</template>
