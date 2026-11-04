import type { MilestoneKey } from '#shared/utils/milestones'

/** The small animated picture on the left of a moment toast (app/components/MomentScene.vue). */
export type MomentScene = 'welcome' | 'verified' | 'connect' | 'schedule' | 'launch' | 'publish' | 'etalase' | 'autoreply'
  | 'link' | 'click' | 'dm' | 'trophy' | 'upgrade' | 'checklist' | 'target' | 'sun' | 'moon'

/**
 * How loud a moment is. `big`: confetti from both sides of the toast and a long stay. `medium`: one small burst.
 * `calm`: no confetti (the greeting after sign-in, which comes back every visit).
 */
export type MomentTier = 'big' | 'medium' | 'calm'

/** Moments that are not once-per-workspace milestones. */
export type MomentKind = MilestoneKey | 'welcome' | 'emailVerified' | 'firstPostNow' | 'weekTarget' | 'greeting'

export interface MomentDef {
  scene: MomentScene
  tier: MomentTier
  /** A "Bagikan" button that makes a story image (app/utils/win-card.ts). */
  share?: boolean
}

export const MOMENTS: Record<MomentKind, MomentDef> = {
  welcome: { scene: 'welcome', tier: 'big' },
  emailVerified: { scene: 'verified', tier: 'medium' },
  firstAccountConnected: { scene: 'connect', tier: 'big' },
  firstPostScheduled: { scene: 'schedule', tier: 'big' },
  firstPostNow: { scene: 'launch', tier: 'big' },
  firstPostPublished: { scene: 'publish', tier: 'big', share: true },
  etalasePublished: { scene: 'etalase', tier: 'big', share: true },
  firstRuleActive: { scene: 'autoreply', tier: 'big' },
  firstLinkAdded: { scene: 'link', tier: 'medium' },
  firstClick: { scene: 'click', tier: 'medium', share: true },
  firstAutoDm: { scene: 'dm', tier: 'medium', share: true },
  clicks100: { scene: 'trophy', tier: 'big', share: true },
  clicks1000: { scene: 'trophy', tier: 'big', share: true },
  clicks10000: { scene: 'trophy', tier: 'big', share: true },
  checklistComplete: { scene: 'checklist', tier: 'big' },
  upgradePaid: { scene: 'upgrade', tier: 'big' },
  weekTarget: { scene: 'target', tier: 'medium', share: true },
  greeting: { scene: 'sun', tier: 'calm' }
}

/** How long each tier stays (ms). Hover, focus or a touch pauses it. */
export const MOMENT_DURATION: Record<MomentTier, number> = { big: 9000, medium: 7000, calm: 8000 }

/** Moments that happen in jobs or out in the world; the console asks GET /api/app/moments when one is still open. */
export const SERVER_MOMENTS = ['firstPostPublished', 'firstClick', 'firstAutoDm', 'clicks100', 'clicks1000', 'clicks10000'] as const satisfies readonly MilestoneKey[]

/** Round click numbers, highest first. Only the highest crossed one is announced. */
export const CLICK_ROUNDS = [{ key: 'clicks10000', n: 10_000 }, { key: 'clicks1000', n: 1000 }, { key: 'clicks100', n: 100 }] as const

/** Part of the day in the workspace timezone, for the greeting. */
export function dayPart(timezone: string, now = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
  let hour = now.getUTCHours()
  try {
    hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(now))
  } catch {
    // unknown timezone: UTC hour is good enough for a greeting
  }
  if (hour >= 4 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 15) return 'afternoon'
  if (hour >= 15 && hour < 18) return 'evening'
  return 'night'
}
