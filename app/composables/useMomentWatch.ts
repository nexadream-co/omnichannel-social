import { PLATFORM_META } from '#shared/channels/registry'
import type { Platform } from '#shared/channels/types'
import type { CreatorProfile } from '~/composables/useCreatorAuth'
import { CLICK_ROUNDS, dayPart, SERVER_MOMENTS } from '~/utils/moments'

interface MomentsSummary {
  firstPublished: { postId: string, platform: Platform, permalink: string | null } | null
  clicksTotal: number
  hasAutoDm: boolean
  upcoming24h: number
  since: { published: number, clicks: number, autoDms: number } | null
}

const GREET_FLAG = 'socialz:greet'
const lastSeenKey = (userId: string) => `socialz:lastSeen:${userId}`
// Once per page load: the shell stays mounted across console pages.
let checked = false

/** Called by the sign-in page right before it leaves: the console greets the creator once it opens. */
export function markGreeting(): void {
  checked = false
  try {
    sessionStorage.setItem(GREET_FLAG, '1')
  } catch {
    // storage refused (private mode): no greeting, nothing else changes
  }
}

function takeGreeting(): boolean {
  try {
    const flag = sessionStorage.getItem(GREET_FLAG)
    sessionStorage.removeItem(GREET_FLAG)
    return flag === '1'
  } catch {
    return false
  }
}

/** The last time this browser opened the console, for "since your last visit". A per-device convenience only. */
function swapLastSeen(userId: string): string | null {
  try {
    const previous = localStorage.getItem(lastSeenKey(userId))
    localStorage.setItem(lastSeenKey(userId), new Date().toISOString())
    return previous && !Number.isNaN(Date.parse(previous)) ? previous : null
  } catch {
    return null
  }
}

/**
 * Runs in CreatorShell: plays the moments that happened while the creator was away (first post live, first click,
 * first auto DM, round click numbers) on whichever console page they open, and the greeting after sign-in.
 */
export function useMomentWatch() {
  const auth = useCreatorAuth()
  const milestones = useMilestones()
  const moments = useMoments()
  const { t, locale } = useI18n()
  const localePath = useLocalePath()
  const number = (n: number) => new Intl.NumberFormat(locale.value).format(n)

  function greet(profile: CreatorProfile, summary: MomentsSummary, hadVisit: boolean) {
    const part = dayPart(profile.displayTimezone)
    const name = profile.user.name.trim().split(/\s+/)[0] ?? ''
    const since = summary.since
    const stats = since
      ? [
          { icon: 'i-lucide-send', value: since.published, label: t('moments.greeting.published') },
          { icon: 'i-lucide-mouse-pointer-click', value: since.clicks, label: t('moments.greeting.clicks') },
          { icon: 'i-lucide-message-circle-reply', value: since.autoDms, label: t('moments.greeting.autoDms') }
        ].filter(stat => stat.value > 0)
      : []
    let body = t('moments.greeting.empty')
    if (stats.length) body = t(hadVisit ? 'moments.greeting.sinceLast' : 'moments.greeting.since24h')
    else if (summary.upcoming24h) body = t('moments.greeting.upcoming', { n: summary.upcoming24h })
    const nudge = !stats.length && !summary.upcoming24h && auth.hasAbility('posts.write')
    moments.show('greeting', {
      title: t(`moments.greeting.${part}`, { name }),
      body,
      stats,
      scene: part === 'night' ? 'moon' : 'sun',
      action: nudge ? { to: localePath('/app/compose'), label: t('moments.greeting.action') } : undefined
    })
  }

  function evaluate(summary: MomentsSummary) {
    const first = summary.firstPublished
    if (first) {
      const platform = PLATFORM_META[first.platform]
      moments.celebrate('firstPostPublished', {
        params: { platform: platform.name },
        platformIcon: platform.icon,
        action: first.permalink ? { to: first.permalink, external: true } : { to: localePath(`/app/posts/${first.postId}`) }
      })
    }
    if (summary.clicksTotal > 0) moments.celebrate('firstClick', { action: { to: localePath('/app/analytics') } })
    if (summary.hasAutoDm) moments.celebrate('firstAutoDm', { action: { to: localePath('/app/auto-reply/activity') } })
    // Only the highest crossed number is announced; the lower ones are marked as seen too.
    let announced = false
    for (const round of CLICK_ROUNDS) {
      if (summary.clicksTotal < round.n) continue
      if (announced) {
        milestones.reach(round.key)
        continue
      }
      const n = number(round.n)
      announced = moments.celebrate(round.key, { params: { n }, share: { stat: n }, action: { to: localePath('/app/analytics') } })
    }
  }

  async function run(profile: CreatorProfile) {
    const greeting = takeGreeting()
    const lastSeen = swapLastSeen(profile.user.id)
    if (profile.impersonating || !auth.hasAbility('analytics.read')) return
    const pending = SERVER_MOMENTS.some(key => !milestones.has(key))
    if (!greeting && !pending) return
    const since = greeting ? (lastSeen ?? new Date(Date.now() - 86_400_000).toISOString()) : undefined
    const summary = await apiFetch<MomentsSummary>('/api/app/moments', { query: since ? { since } : {} }).catch(() => null)
    if (!summary) return
    if (greeting) greet(profile, summary, Boolean(lastSeen))
    evaluate(summary)
  }

  onMounted(() => {
    watch(() => auth.profile.value, (profile) => {
      if (!profile || checked) return
      checked = true
      void run(profile)
    }, { immediate: true })
  })
}
