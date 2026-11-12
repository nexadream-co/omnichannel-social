import type { Platform } from '../channels/types'
import type { Merchant } from './links'

/** A post's click rate is only shown once it has been live this long, so a post from this morning is never ranked. */
export const RATE_MIN_AGE_HOURS = 24
/** …and seen by at least this many people, so 1 click from 3 views never reads as "333 per 1.000". */
export const RATE_MIN_VIEWS = 100

/** The "seen" number a platform gives us, most comparable first. Facebook gives none yet. */
export function viewsOf(metrics: Record<string, unknown> | null | undefined): number | null {
  if (!metrics) return null
  for (const key of ['views', 'impressions', 'reach']) {
    const value = metrics[key]
    if (typeof value === 'number') return value
  }
  return null
}

/** Clicks per 1.000 views, one decimal; null below the thresholds above. */
export function ratePer1000(clicks: number, views: number | null): number | null {
  if (views === null || views < RATE_MIN_VIEWS) return null
  return Math.round((clicks / views) * 10_000) / 10
}

/**
 * Change against the period before, as a whole percent. null = nothing to compare with
 * (no earlier period, or both zero); 'new' = something now where there was nothing before.
 */
export function deltaPercent(now: number, previous: number | null | undefined): number | 'new' | null {
  if (previous === null || previous === undefined) return null
  if (previous === 0) return now > 0 ? 'new' : null
  return Math.round(((now - previous) / previous) * 100)
}

/** GET /api/app/analytics. The page and the service both use this type, so the two cannot drift. */
export interface WorkspaceAnalytics {
  window: { days: number, requestedDays: number, clamped: boolean, today: string }
  totals: { clicks: number, uniques: number }
  /** The same numbers for the equally long period just before; null when the plan's click history does not reach that far back. */
  previous: { clicks: number, uniques: number, dmSent: number } | null
  daily: { day: string, clicks: number }[]
  topLinks: { linkId: string, title: string | null, merchant: Merchant, imageUrl: string | null, clicks: number }[]
  bySource: { source: string, clicks: number }[]
  byChannel: { channel: string, clicks: number }[]
  /** Posts with the most clicks in the window. `ratePer1000` only for posts published inside the window and past the thresholds. */
  topPosts: { postId: string, caption: string, platform: Platform, clicks: number, views: number | null, ratePer1000: number | null }[]
  devices: { device: string, clicks: number }[]
  cities: { city: string, clicks: number }[]
  /** Posts published in the window: how many of the people who saw them clicked a product. */
  posting: {
    published: number
    /** Of those: live for RATE_MIN_AGE_HOURS and with a views number from the platform. */
    measured: number
    views: number
    clicks: number
    /** null when the measured posts together have fewer than RATE_MIN_VIEWS views. */
    ratePer1000: number | null
    /** The same for posts published in the period before; null when there is none to compare. */
    previousRatePer1000: number | null
    /** Platforms among the published posts that give no views number (Facebook today). */
    noViewsPlatforms: Platform[]
  }
  /** Balas Otomatis: comments that matched a rule → DMs sent → clicks on the links in those DMs. */
  autoReply: {
    matched: number
    sent: number
    clicks: number
    /** DM clicks on links made before DM links were per rule; part of `clicks`, not of any rule row. */
    unattributedClicks: number
    /** Up to 5 rules, most DMs sent first. Deleted rules are left out (their numbers stay in the totals). */
    rules: { ruleId: string, name: string, active: boolean, matched: number, sent: number, clicks: number }[]
  }
}
