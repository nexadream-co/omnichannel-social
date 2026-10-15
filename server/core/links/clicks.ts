import { randomBytes } from 'node:crypto'
import { and, eq, gte } from 'drizzle-orm'
import { sha256 } from '../crypto'
import type { Executor } from '../db/client'
import { bioPages, ipSalts, linkClicks, links, shortLinks } from '../db/schema'
import { todayKey } from '../timezone'
import { getCachedSlug, setCachedSlug, type ResolvedSlug } from './cache'

const BOT_UA = /facebookexternalhit|meta-externalagent|facebookcatalog|whatsapp|telegrambot|twitterbot|slackbot|discordbot|googlebot|bingbot|applebot|linkedinbot|curl|wget|python-requests|headlesschrome|bot\b|spider|crawler|preview/i

export function detectBot(ua: string, method: string, purpose: string | null): boolean {
  return !ua || method === 'HEAD' || purpose === 'prefetch' || BOT_UA.test(ua)
}

/** In-app browsers: Instagram, Threads ("Barcelona") and Facebook (FBAN/FBAV). The referrer is usually empty there. */
export function detectInApp(ua: string): 'ig' | 'threads' | 'fb' | 'none' {
  if (/Barcelona/i.test(ua)) return 'threads'
  if (/Instagram/i.test(ua)) return 'ig'
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'fb'
  return 'none'
}

export function detectDevice(ua: string): { device: 'phone' | 'tablet' | 'desktop', os: string } {
  const os = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Windows/i.test(ua) ? 'windows' : /Mac OS X/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : 'other'
  const device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'phone' : 'desktop'
  return { device, os }
}

export function referrerDomain(referrer: string | null): string | null {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname.replace(/^www\./, '').slice(0, 100)
  } catch {
    return null
  }
}

/** One indexed query on a cache miss; null for unknown slugs (cached too, so a flood of 404s is cheap). */
export async function resolveSlug(db: Executor, slug: string): Promise<ResolvedSlug | null> {
  const cached = getCachedSlug(slug)
  if (cached !== undefined) return cached
  const [row] = await db.select({ shortLinkId: shortLinks.id, workspaceId: shortLinks.workspaceId, active: shortLinks.active, destinationUrl: links.destinationUrl, archived: links.archived })
    .from(shortLinks).innerJoin(links, eq(links.id, shortLinks.linkId)).where(eq(shortLinks.slug, slug)).limit(1)
  let value: ResolvedSlug | null = null
  if (row) {
    const [bio] = await db.select({ handle: bioPages.handle }).from(bioPages).where(and(eq(bioPages.workspaceId, row.workspaceId), eq(bioPages.published, true))).limit(1)
    // Archiving a product in the vault never breaks a follower's tap: redirects always work (docs/blueprint/06 §5).
    value = { shortLinkId: row.shortLinkId, workspaceId: row.workspaceId, destinationUrl: row.active ? row.destinationUrl : null, bioHandle: bio?.handle ?? null }
  }
  setCachedSlug(slug, value)
  return value
}

async function dailySalt(db: Executor): Promise<string> {
  const day = todayKey()
  const [row] = await db.select({ salt: ipSalts.salt }).from(ipSalts).where(eq(ipSalts.day, day)).limit(1)
  if (row) return row.salt
  await db.insert(ipSalts).values({ day, salt: randomBytes(16).toString('hex') }).onConflictDoNothing()
  return (await db.select({ salt: ipSalts.salt }).from(ipSalts).where(eq(ipSalts.day, day)).limit(1))[0]!.salt
}

export interface ClickInput {
  shortLinkId: string
  workspaceId: string
  ip: string | null
  userAgent: string
  method: string
  purpose: string | null
  referrer: string | null
  country: string | null
  region: string | null
  city: string | null
}

/**
 * Recorded after the redirect is sent (waitUntil). ip_hash = sha256(ip ‖ daily salt): unique visitors
 * per day without ever storing an IP (ARCHITECTURE §10.1).
 */
export async function recordClick(db: Executor, input: ClickInput): Promise<void> {
  const ipHash = input.ip ? sha256(`${input.ip}|${await dailySalt(db)}`) : null
  const { device, os } = detectDevice(input.userAgent)
  const isBot = detectBot(input.userAgent, input.method, input.purpose)
  const startOfDay = new Date(Date.now() - (Date.now() % 86_400_000))
  const firstToday = ipHash
    ? !(await db.select({ id: linkClicks.id }).from(linkClicks).where(and(eq(linkClicks.shortLinkId, input.shortLinkId), eq(linkClicks.ipHash, ipHash), gte(linkClicks.clickedAt, startOfDay))).limit(1)).length
    : false
  await db.insert(linkClicks).values({
    workspaceId: input.workspaceId, shortLinkId: input.shortLinkId, ipHash,
    country: input.country?.slice(0, 2) ?? null, region: input.region?.slice(0, 80) ?? null, city: input.city?.slice(0, 80) ?? null,
    device, os, inApp: detectInApp(input.userAgent), referrerDomain: referrerDomain(input.referrer), isBot, isUniqueDay: firstToday && !isBot
  })
}
