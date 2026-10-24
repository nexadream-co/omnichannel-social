<script setup lang="ts">
import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import { useCelebrate } from '~/composables/useCelebrate'
import { useMilestones } from '~/composables/useMilestones'

/** Beranda moments: one-time cards for the first published post, first click, first auto DM and round click counts. */
export interface MomentsSummary {
  clicks7d: number
  clicksTotal: number
  autoReplies7d: number
  firstPublished: { postId: string, platform: Platform, permalink: string | null, publishedAt: string } | null
}

type Key = 'firstPostPublished' | 'firstClick' | 'firstAutoDm' | 'clicks100' | 'clicks1000' | 'clicks10000'
interface Moment { key: Key, icon: string, title: string, to?: string, external?: boolean, action?: string }

const props = defineProps<{ summary: MomentsSummary | null }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { reach } = useMilestones()
const { confetti, spark } = useCelebrate()

const ROUND: { key: Key, n: number }[] = [{ key: 'clicks10000', n: 10_000 }, { key: 'clicks1000', n: 1000 }, { key: 'clicks100', n: 100 }]

// Moments reached during this visit. Recording happens on display; the card stays until dismissed.
const shown = ref<Moment[]>([])
const dismissed = ref(new Set<Key>())
const cards = ref<HTMLElement[]>([])

function show(moment: Moment, big = false) {
  shown.value = [...shown.value, moment]
  nextTick(() => {
    const card = cards.value.find(el => el.dataset.key === moment.key)
    if (big) confetti({ origin: card })
    else if (card) spark(card)
  })
}

function evaluate(summary: MomentsSummary) {
  const first = summary.firstPublished
  if (first && reach('firstPostPublished')) {
    show({
      key: 'firstPostPublished',
      icon: 'i-lucide-rocket',
      title: t('home.moments.firstPostPublished', { platform: PLATFORM_META[first.platform].name }),
      to: first.permalink ?? localePath(`/app/posts/${first.postId}`),
      external: Boolean(first.permalink),
      action: t('home.moments.see')
    }, true)
  }
  if (summary.clicks7d > 0 && reach('firstClick')) show({ key: 'firstClick', icon: 'i-lucide-mouse-pointer-click', title: t('home.moments.firstClick'), to: localePath('/app/analytics'), action: t('home.moments.seeStats') })
  if (summary.autoReplies7d > 0 && reach('firstAutoDm')) show({ key: 'firstAutoDm', icon: 'i-lucide-message-circle-reply', title: t('home.moments.firstAutoDm', { n: summary.autoReplies7d }), to: localePath('/app/auto-reply/activity'), action: t('home.moments.see') })
  // Only the highest crossed number is announced; the lower ones are marked as seen too.
  const crossed = ROUND.filter(round => summary.clicksTotal >= round.n)
  let announced = false
  for (const round of crossed) {
    const fresh = reach(round.key)
    if (fresh && !announced) {
      announced = true
      show({ key: round.key, icon: 'i-lucide-trophy', title: t('home.moments.clicksRound', { n: new Intl.NumberFormat(locale.value).format(round.n) }) })
    }
  }
}

let evaluated = false
watch(() => props.summary, (summary) => {
  if (!summary || evaluated) return
  evaluated = true
  evaluate(summary)
}, { immediate: true })

const visible = computed(() => shown.value.filter(moment => !dismissed.value.has(moment.key)))
</script>

<template>
  <TransitionGroup
    name="list"
    tag="div"
    class="space-y-3 empty:hidden"
  >
    <div
      v-for="moment in visible"
      :key="moment.key"
      ref="cards"
      :data-key="moment.key"
      class="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 sm:p-4"
    >
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <UIcon
          :name="moment.icon"
          class="size-5"
        />
      </span>
      <p class="min-w-0 flex-1 text-sm font-medium text-highlighted">
        {{ moment.title }}
      </p>
      <UButton
        v-if="moment.to && moment.action"
        :to="moment.to"
        :target="moment.external ? '_blank' : undefined"
        size="sm"
        variant="soft"
        :label="moment.action"
        class="shrink-0"
      />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        :aria-label="t('common.close')"
        @click="dismissed = new Set([...dismissed, moment.key])"
      />
    </div>
  </TransitionGroup>
</template>
