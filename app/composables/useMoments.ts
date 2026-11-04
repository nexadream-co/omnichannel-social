import { h } from 'vue'
import type { MilestoneKey } from '#shared/utils/milestones'
import MomentToastContent, { type MomentStat } from '~/components/MomentToastContent.vue'
import { MOMENT_DURATION, MOMENTS, type MomentKind, type MomentScene } from '~/utils/moments'
import { shareWinCard, type WinCard } from '~/utils/win-card'

export interface MomentOptions {
  /** i18n params for `moments.<kind>.title`, `.body` and `.share`. */
  params?: Record<string, unknown>
  title?: string
  body?: string
  stats?: MomentStat[]
  /** The next step. The label defaults to `moments.<kind>.action`. */
  action?: { to: string, label?: string, external?: boolean }
  share?: Partial<WinCard>
  scene?: MomentScene
  platformIcon?: string
}

// Moments that land together (the greeting and a few server moments on one visit) play one at a time: the next one
// starts shortly after the current one closes, so a phone never shows a wall of toasts. A fallback timer keeps the
// queue moving if a close is never reported.
const GAP_MS = 450
const waiting: (() => void)[] = []
let playing = false

function playNext() {
  const next = waiting.shift()
  playing = Boolean(next)
  next?.()
}

function enqueue(play: (done: () => void) => void) {
  waiting.push(() => {
    let finished = false
    play(() => {
      if (finished) return
      finished = true
      setTimeout(playNext, GAP_MS)
    })
  })
  if (!playing) playNext()
}

/**
 * Big moments as a catchy toast (docs/ux-audit §2.4): an animated scene, a gradient border that sweeps around,
 * confetti from the toast, a vibration and the next step. Built on the app toaster, so it stacks, pauses on hover,
 * swipes away and works above an open sheet. Under reduced motion it is a still toast with a badge.
 */
export function useMoments() {
  const { t, te } = useI18n()
  const toast = useToast()
  const milestones = useMilestones()
  const auth = useCreatorAuth()
  const { confetti, haptic } = useCelebrate()

  /** Once per workspace: plays `as` (default: the milestone itself) only the first time. Returns whether it played. */
  function celebrate(key: MilestoneKey, opts: MomentOptions & { as?: MomentKind } = {}): boolean {
    if (!milestones.reach(key)) return false
    show(opts.as ?? key, opts)
    return true
  }

  function show(kind: MomentKind, opts: MomentOptions = {}): void {
    if (!import.meta.client) return
    enqueue(done => present(kind, opts, done))
  }

  function text(key: string, params: Record<string, unknown>): string | undefined {
    return te(key) ? t(key, params) : undefined
  }

  function present(kind: MomentKind, opts: MomentOptions, done: () => void) {
    const def = MOMENTS[kind]
    const duration = MOMENT_DURATION[def.tier]
    const params = opts.params ?? {}
    const id = `moment-${kind}-${Date.now()}`
    const title = opts.title ?? t(`moments.${kind}.title`, params)
    const body = opts.body ?? text(`moments.${kind}.body`, params)

    const actions: Record<string, unknown>[] = []
    if (opts.action) {
      actions.push({
        label: opts.action.label ?? t(`moments.${kind}.action`, params),
        to: opts.action.to,
        target: opts.action.external ? '_blank' : undefined,
        color: 'primary',
        variant: 'solid',
        trailingIcon: 'i-lucide-arrow-right'
      })
    }
    if (def.share) {
      const name = auth.profile.value?.user.name
      const card: WinCard = { headline: t(`moments.${kind}.share`, params), sub: name ? `— ${name}` : undefined, footer: t('moments.shareFooter'), ...opts.share }
      actions.push({ label: t('moments.share'), icon: 'i-lucide-share-2', color: 'neutral', variant: 'outline', onClick: () => share(card) })
    }

    // The toaster also listens to update:open; Vue calls both listeners.
    const onClose = { 'onUpdate:open': (open: boolean) => open || done() }
    toast.add({
      id,
      title: () => h(MomentToastContent, { momentId: id, scene: opts.scene ?? def.scene, platformIcon: opts.platformIcon, title, body, stats: opts.stats }),
      color: 'primary',
      duration,
      class: def.tier === 'big' ? 'moment-toast moment-toast-big' : 'moment-toast',
      ui: { root: 'ring-0 p-3.5', title: 'font-normal', actions: 'mt-3 flex-wrap ps-[4.25rem]' },
      actions: actions.length ? actions : undefined,
      ...onClose
    })
    // Hover or touch pauses a toast, so this only fires long after a normal close.
    setTimeout(done, duration * 2)

    if (def.tier === 'calm') {
      haptic('tick')
      return
    }
    // The toast slides in first; the burst comes out of it once it is in place.
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-moment-id="${id}"]`)
      const rect = el?.getBoundingClientRect()
      if (!rect) {
        void confetti({ big: def.tier === 'big' })
        return
      }
      if (def.tier === 'big') {
        void confetti({ origin: { x: rect.left + 28, y: rect.top + 28 }, angle: 120, spread: 60, particleCount: 70 })
        void confetti({ origin: { x: rect.right - 12, y: rect.top + 12 }, angle: 60, spread: 60, particleCount: 70, haptics: false })
      } else {
        void confetti({ origin: { x: rect.left + 28, y: rect.top + 28 }, angle: 90, spread: 70, particleCount: 45 })
      }
    }, 260)
  }

  async function share(card: WinCard) {
    try {
      const result = await shareWinCard(card)
      if (result === 'downloaded') toast.add({ title: t('moments.shareSaved'), color: 'success', icon: 'i-lucide-image-down' })
    } catch {
      toast.add({ title: t('moments.shareFailed'), color: 'error' })
    }
  }

  return { celebrate, show }
}
