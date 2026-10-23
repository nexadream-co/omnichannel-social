<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { momentName, PILLAR_META, type PlannerIdea } from '#shared/utils/planner'
import type { DayPost, MomentMark } from '~/utils/calendar'

/**
 * Phone: a list of days. The week shows every day from today on, so empty ones can be filled; past days and
 * the month show only days with something on them.
 */
const props = defineProps<{ days: string[], showEmpty: boolean, today: string, loading: boolean, posts: Map<string, DayPost[]>, ideas: Map<string, PlannerIdea[]>, marks: Map<string, MomentMark[]> }>()
const emit = defineEmits<{ fill: [day: string], openIdea: [id: string] }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const planner = usePlanner()
const canWrite = computed(() => auth.hasAbility('posts.write'))

const listed = computed(() => props.days.filter(day => (props.showEmpty && day >= props.today) || props.posts.has(day) || props.ideas.has(day) || props.marks.has(day)))
const removedLabel = (p: Platform) => t('posts.removedOn', { platform: PLATFORM_META[p].name })
</script>

<template>
  <div class="space-y-4">
    <p
      v-if="!loading && !listed.length"
      class="text-center text-muted py-10"
    >
      {{ t('calendar.empty') }}
    </p>
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
          <NuxtLink
            :to="localePath(`/app/posts/${post.postId}`)"
            class="flex items-center gap-3 rounded-md border border-default bg-default p-3"
          >
            <span
              class="size-2 rounded-full shrink-0"
              :class="postDot(post.status)"
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
