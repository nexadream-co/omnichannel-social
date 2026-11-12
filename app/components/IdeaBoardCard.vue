<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { PILLAR_META, type IdeaDetail } from '#shared/utils/planner'
import { flipFrom, takeDragFlight } from '~/utils/flip'
import { haptic } from '~/utils/haptics'
import { PILLAR_EDGE } from '~/utils/ideaBoard'

/**
 * One idea on the Ide board: a preview picture when there is media, the title and first note line, what it holds
 * (content type, moment, products, platforms), a stage-aware date line and what is still missing. Drags between and
 * within columns (mouse, pen or a touch hold). `floating`: the copy that follows the pointer (no drag, no menu).
 * `ghost`: the original while its copy is carried, a dashed 40% placeholder.
 */
const props = defineProps<{ idea: IdeaDetail, floating?: boolean, ghost?: boolean }>()
const emit = defineEmits<{ open: [idea: IdeaDetail], move: [idea: IdeaDetail] }>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const auth = useCreatorAuth()
const planner = usePlanner()

const NuxtLink = resolveComponent('NuxtLink')
const canWrite = computed(() => auth.hasAbility('posts.write'))
const el = ref<HTMLElement | null>(null)

const first = computed(() => props.idea.media[0] ?? null)
const cover = computed(() => {
  const media = first.value
  if (media) return media.kind === 'image' ? media.url : media.posterUrl
  return props.idea.post?.thumb ?? null
})
const hasPicture = computed(() => Boolean(first.value) || Boolean(props.idea.post?.thumb))
const isVideo = computed(() => first.value ? first.value.kind === 'video' : props.idea.post?.mediaKind === 'video')
const duration = computed(() => first.value?.kind === 'video' && first.value.durationMs ? formatDuration(first.value.durationMs) : null)
const mediaCount = computed(() => props.idea.media.length || props.idea.post?.mediaCount || 0)

const noteLine = computed(() => props.idea.note?.split('\n').map(line => line.trim()).find(Boolean) ?? null)
const platforms = computed(() => [...new Set(props.idea.post?.platforms ?? [])])
const post = computed(() => props.idea.post)

const intlLocale = computed(() => locale.value === 'en' ? 'en-GB' : 'id-ID')
const short = (date: Date, timeZone: string) => new Intl.DateTimeFormat(intlLocale.value, { day: 'numeric', month: 'short', timeZone }).format(date)

type Tone = 'muted' | 'error' | 'warning'
const dateLine = computed<{ text: string, tone: Tone, icon: string, to?: string } | null>(() => {
  const idea = props.idea
  const p = post.value
  if (p) {
    const link = localePath(`/app/posts/${p.id}`)
    switch (p.status) {
      case 'failed': return { text: t('ideas.card.failedFix'), tone: 'error', icon: 'i-lucide-circle-alert', to: link }
      case 'partial': return { text: t('ideas.card.partial'), tone: 'warning', icon: 'i-lucide-triangle-alert', to: link }
      case 'published': return p.publishedAt ? { text: t('ideas.card.live', { when: formatRelative(p.publishedAt, locale.value) }), tone: 'muted', icon: 'i-lucide-circle-check' } : null
      case 'publishing': return { text: t('ideas.card.publishing'), tone: 'muted', icon: 'i-lucide-loader' }
      case 'scheduled': {
        if (!p.scheduledAt) return null
        const at = new Date(p.scheduledAt)
        const time = zonedParts(at, planner.tzOf()).time
        return { text: t('ideas.card.publishAt', { date: short(at, planner.tzOf()), time }), tone: 'muted', icon: 'i-lucide-calendar-clock' }
      }
      case 'cancelled': return { text: t('ideas.card.cancelledPost'), tone: 'muted', icon: 'i-lucide-ban', to: link }
      default: return { text: t('ideas.card.draftPost'), tone: 'muted', icon: 'i-lucide-file-pen', to: link }
    }
  }
  if (idea.plannedOn) return { text: t('ideas.card.plan', { date: short(new Date(`${idea.plannedOn}T12:00:00Z`), 'UTC') }), tone: 'muted', icon: 'i-lucide-calendar' }
  return null
})
const toneClass: Record<Tone, string> = { muted: 'text-muted', error: 'text-error font-medium', warning: 'text-warning font-medium' }

const readiness = computed(() => (props.idea.stage === 'raw' || props.idea.stage === 'drafting') && !post.value
  ? [
      { key: 'product', ok: props.idea.links.length > 0 },
      { key: 'media', ok: props.idea.media.length > 0 },
      { key: 'note', ok: Boolean(noteLine.value) }
    ]
  : [])

const manual = computed(() => props.idea.stage !== props.idea.actualStage)
const manualTip = computed(() => t('ideas.card.manualTip', { stage: t(`ideas.stage.${props.idea.actualStage}`) }))
const hasInfo = computed(() => Boolean(props.idea.pillar || props.idea.momentId || props.idea.links.length || platforms.value.length))

function open() {
  if (!props.floating) emit('open', props.idea)
}

const menu = computed<DropdownMenuItem[][]>(() => {
  const idea = props.idea
  const view = idea.postId ? [{ label: t('planner.idea.openPost'), icon: 'i-lucide-external-link', to: localePath(`/app/posts/${idea.postId}`) }] : []
  if (!canWrite.value) return view.length ? [view] : []
  return [
    [
      { label: t('ideas.card.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('open', idea) },
      ...(idea.status === 'open' ? [{ label: t('planner.idea.toPost'), icon: 'i-lucide-square-pen', onSelect: () => planner.toPost(idea.id) }] : []),
      ...view,
      { label: t('ideas.move.title'), icon: 'i-lucide-move-right', onSelect: () => emit('move', idea) }
    ],
    [{ label: t('planner.idea.archive'), icon: 'i-lucide-archive', onSelect: () => planner.archiveIdea(idea.id) }]
  ]
})

useDragSource(el, {
  enabled: () => canWrite.value && !props.floating && props.idea.status !== 'archived',
  payload: () => ({ kind: 'card', id: props.idea.id, from: props.idea.stage, actual: props.idea.actualStage }),
  preview: () => ({ kind: 'card', title: props.idea.title, idea: props.idea, stage: props.idea.stage, thumb: cover.value, video: isVideo.value }),
  // Let go over nothing (or Esc): the card springs back into its slot.
  onCancel: () => {
    haptic('warn')
    void nextTick(() => {
      const flight = takeDragFlight()
      if (flight && el.value) flipFrom(el.value, flight)
    })
  }
})
</script>

<template>
  <div
    ref="el"
    :data-card="idea.id"
    :role="floating ? undefined : 'button'"
    :tabindex="floating ? -1 : 0"
    :aria-label="floating ? undefined : idea.title"
    class="group/card relative overflow-hidden rounded-lg border bg-default text-left select-none [-webkit-touch-callout:none] outline-none focus-visible:ring-2 focus-visible:ring-primary"
    :class="[
      ghost ? 'opacity-40 border-dashed border-accented' : manual ? 'border-dashed border-warning/70' : 'border-default',
      !hasPicture ? ['border-l-[3px]', idea.pillar && !manual && !ghost ? PILLAR_EDGE[idea.pillar] : ''] : '',
      floating ? '' : canWrite ? 'cursor-grab active:cursor-grabbing touch-pan-y hover:border-accented motion-safe:transition-colors' : 'cursor-pointer'
    ]"
    @click="open"
    @keydown.enter.self.prevent="open"
    @keydown.space.self.prevent="open"
  >
    <div
      v-if="hasPicture"
      class="relative aspect-[4/3] bg-elevated"
    >
      <SmartImage
        :src="cover"
        kind="media"
        :alt="idea.title"
        class="absolute inset-0"
      />
      <span
        v-if="isVideo"
        class="absolute inset-0 grid place-items-center"
      >
        <span class="size-10 rounded-full bg-black/55 grid place-items-center">
          <UIcon
            name="i-lucide-play"
            class="size-5 text-white"
          />
        </span>
      </span>
      <span
        v-if="duration"
        class="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] leading-none text-white tabular-nums"
      >{{ duration }}</span>
      <span
        v-if="mediaCount > 1"
        class="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] leading-none text-white tabular-nums"
      >{{ t('ideas.card.mediaCount', { n: mediaCount }) }}</span>
    </div>

    <div class="p-3 flex flex-col gap-2">
      <div>
        <p
          class="text-sm font-medium text-highlighted line-clamp-2 break-words"
          :class="hasPicture ? '' : 'pr-8'"
        >
          {{ idea.title }}
        </p>
        <p
          v-if="noteLine"
          class="mt-0.5 text-xs text-muted line-clamp-1 break-words"
        >
          {{ noteLine }}
        </p>
      </div>

      <div
        v-if="hasInfo"
        class="flex flex-wrap items-center gap-x-2 gap-y-1.5"
      >
        <UBadge
          v-if="idea.pillar"
          :icon="PILLAR_META[idea.pillar].icon"
          :label="t(PILLAR_META[idea.pillar].labelKey)"
          color="neutral"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="idea.momentId"
          icon="i-lucide-party-popper"
          :label="t('ideas.card.moment')"
          color="warning"
          variant="subtle"
          size="sm"
        />
        <span
          v-if="idea.links.length"
          class="flex items-center gap-1 text-xs text-muted"
        >
          <SmartImage
            :src="idea.links[0]!.imageUrl"
            :title="idea.links[0]!.title"
            kind="product"
            class="size-5 rounded"
          />
          {{ t('planner.idea.productCount', { n: idea.links.length }) }}
        </span>
        <span
          v-if="platforms.length"
          class="flex -space-x-1"
        >
          <PlatformBadge
            v-for="p in platforms"
            :key="p"
            :platform="p"
            size="xs"
          />
        </span>
      </div>

      <component
        :is="dateLine.to && !floating ? NuxtLink : 'p'"
        v-if="dateLine"
        :to="dateLine.to && !floating ? dateLine.to : undefined"
        class="flex items-center gap-1.5 text-xs"
        :class="[toneClass[dateLine.tone], dateLine.to ? 'hover:underline' : '']"
        data-no-drag
        @click.stop
      >
        <UIcon
          :name="dateLine.icon"
          class="size-3.5 shrink-0"
        />
        <span class="min-w-0 truncate">{{ dateLine.text }}</span>
      </component>

      <div
        v-if="readiness.length"
        class="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span
          v-for="check in readiness"
          :key="check.key"
          class="flex items-center gap-1 text-xs"
          :class="check.ok ? 'text-default' : 'text-muted'"
        >
          <UIcon
            :name="check.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
            class="size-3.5"
            :class="check.ok ? 'text-success' : 'text-dimmed'"
          />
          {{ t(`ideas.card.checks.${check.key}`) }}
        </span>
      </div>

      <UTooltip
        v-if="manual"
        :text="manualTip"
      >
        <span
          class="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-warning/70 px-1.5 py-0.5 text-xs text-warning"
          :title="manualTip"
        >
          <UIcon
            name="i-lucide-hand"
            class="size-3.5"
          />
          {{ t('ideas.card.manual') }}
        </span>
      </UTooltip>
    </div>

    <UDropdownMenu
      v-if="!floating && menu.length"
      :items="menu"
      :content="{ align: 'end' }"
    >
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        class="absolute top-1.5 right-1.5 size-9 justify-center bg-default/90 hover:bg-elevated"
        data-no-drag
        :aria-label="t('planner.idea.actions')"
        @click.stop
      />
    </UDropdownMenu>
  </div>
</template>
