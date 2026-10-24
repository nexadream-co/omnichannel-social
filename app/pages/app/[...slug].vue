<script setup lang="ts">
import { CREATOR_NAV } from '#shared/utils/menus'

// A mistyped address inside the console: say so, and offer the pages the creator most likely meant.
definePageMeta({ layout: 'creator' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useCreatorAuth()
useHead({ title: () => t('notFound.title') })

const visible = computed(() => CREATOR_NAV.filter(item => !item.ability || auth.hasAbility(item.ability)))

function score(segment: string, label: string, to: string): number {
  const word = segment.toLowerCase()
  if (!word) return 0
  const candidates = [label.toLowerCase(), to.split('/').pop()!.toLowerCase()]
  let best = 0
  for (const candidate of candidates) {
    if (candidate.includes(word) || word.includes(candidate)) best = Math.max(best, 100 + Math.min(word.length, candidate.length))
    let shared = 0
    while (shared < word.length && shared < candidate.length && word[shared] === candidate[shared]) shared++
    best = Math.max(best, shared)
  }
  return best
}

const suggestions = computed(() => {
  const segments = route.path.split('/').filter(Boolean)
  const last = decodeURIComponent(segments[segments.length - 1] ?? '')
  const ranked = visible.value
    .map(item => ({ item, points: score(last, t(item.labelKey), item.to) }))
    .filter(entry => entry.points > 1)
    .sort((a, b) => b.points - a.points)
    .map(entry => entry.item)
  const pad = ['home', 'compose', 'calendar']
    .map(key => visible.value.find(item => item.key === key))
    .filter(item => item !== undefined)
  const seen = new Set<string>()
  return [...ranked, ...pad].filter((item) => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  }).slice(0, 3)
})
</script>

<template>
  <EmptyState
    icon="i-lucide-map-pin-off"
    :title="t('notFound.title')"
    :description="t('notFound.body')"
  >
    <div class="flex flex-wrap justify-center gap-2">
      <UButton
        v-for="item in suggestions"
        :key="item.key"
        :to="localePath(item.to)"
        :icon="item.icon"
        :label="t(item.labelKey)"
        color="neutral"
        variant="outline"
      />
    </div>
  </EmptyState>
</template>
