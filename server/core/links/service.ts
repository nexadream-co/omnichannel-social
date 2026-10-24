import { randomBytes } from 'node:crypto'
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { AUTO_SLUG_LENGTH, detectMerchant, hostAllowed, SLUG_PATTERN } from '../../../shared/utils/links'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Executor } from '../db/client'
import { linkClicks, links, postTargets, shortLinks } from '../db/schema'
import { can } from '../entitlements'
import { env } from '../env'
import { appError } from '../errors'
import { enqueue } from '../jobs/enqueue'
import { assertRateLimit } from '../rate-limit'
import { getSettingBool, getSettingJson } from '../settings'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function randomSlug(length = AUTO_SLUG_LENGTH): string {
  const bytes = randomBytes(length)
  return [...bytes].map(b => BASE62[b % 62]).join('')
}

/** True when short links share the app host (dev, previews): then the explicit /r/ and /bio/ paths are used. */
function sharedHost(): boolean {
  const config = env()
  return new URL(config.shortUrl).host === new URL(config.siteUrl).host
}

export function shortUrl(slug: string): string {
  return sharedHost() ? `${env().shortUrl}/r/${slug}` : `${env().shortUrl}/${slug}`
}

export function bioUrl(handle: string): string {
  return sharedHost() ? `${env().shortUrl}/bio/${handle}` : `${env().shortUrl}/@${handle}`
}

export const linkSchema = z.object({
  destinationUrl: z.url({ protocol: /^https$/, error: 'Tempel link produk yang diawali https://' }).max(2000),
  title: z.string().trim().max(200).nullable().optional(),
  imageUrl: z.url().max(2000).nullable().optional(),
  // The photo the paste preview found: the autofill job re-hosts it instead of reading the page again.
  imageSourceUrl: z.url({ protocol: /^https$/ }).max(2000).optional(),
  priceIdr: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  customSlug: z.string().trim().optional(),
  showInBio: z.boolean().default(true) // "Tampil di Etalase" is on by default (docs/SCREENS.md #21)
})

/** Saved destinations are checked when saved, never at redirect time (docs/blueprint/14 §5). */
async function assertDestinationAllowed(ctx: WorkspaceContext, url: string) {
  if (!(await getSettingBool('channels.links.freePlanAllowlistOnly', ctx.db))) return
  if (await can(ctx.workspaceId, 'anyDestination', ctx.db)) return
  const allowlist = await getSettingJson<string[]>('channels.links.affiliateAllowlist', [], ctx.db)
  if (!hostAllowed(url, allowlist)) {
    throw appError(402, 'Di paket ini, link harus ke toko afiliasi (Shopee, Tokopedia, TikTok Shop, Lazada). Upgrade untuk memakai link ke situs lain.', 'PLAN_REQUIRED', { feature: 'anyDestination' })
  }
}

/** Unique slug: a custom one when the plan allows (else ignored, degrade), otherwise random base62. */
async function allocateSlug(ctx: WorkspaceContext, db: Executor, custom: string | undefined) {
  if (custom) {
    if (!SLUG_PATTERN.test(custom)) throw appError(400, 'Nama link hanya huruf, angka, - dan _ (3–32 karakter).', 'VALIDATION_FAILED', { field: 'customSlug' })
    if (await can(ctx.workspaceId, 'customSlug', db)) {
      const [taken] = await db.select({ id: shortLinks.id }).from(shortLinks).where(eq(shortLinks.slug, custom)).limit(1)
      if (taken) throw appError(409, 'Nama link ini sudah dipakai. Coba yang lain.', 'CONFLICT', { field: 'customSlug' })
      return { slug: custom, customIgnored: false }
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug()
    const [taken] = await db.select({ id: shortLinks.id }).from(shortLinks).where(eq(shortLinks.slug, slug)).limit(1)
    if (!taken) return { slug, customIgnored: Boolean(custom) }
  }
  throw appError(500, 'Gagal membuat link pendek. Coba lagi.', 'SERVER_ERROR')
}

export function toLinkView(row: typeof links.$inferSelect, short: { slug: string } | undefined, clicks7d = 0) {
  return {
    id: row.id, destinationUrl: row.destinationUrl, merchant: row.merchant, title: row.title, imageUrl: row.imageUrl,
    priceIdr: row.priceIdr, tags: row.tags, archived: row.archived, createdAt: row.createdAt,
    slug: short?.slug ?? null, shortUrl: short ? shortUrl(short.slug) : null, clicks7d
  }
}

/** POST /api/app/links: one paste → product link + short link (+ autofill job when details are missing). */
export async function createLink(ctx: WorkspaceContext, input: z.infer<typeof linkSchema>) {
  assertAbility(ctx, 'links.manage')
  await assertRateLimit('link:create', ctx.workspaceId, 120, 3_600_000, ctx.db)
  await assertDestinationAllowed(ctx, input.destinationUrl)
  const result = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(links).values({
      workspaceId: ctx.workspaceId, destinationUrl: input.destinationUrl, merchant: detectMerchant(input.destinationUrl),
      title: input.title ?? null, imageUrl: input.imageUrl ?? null, priceIdr: input.priceIdr ?? null, tags: input.tags ?? []
    }).returning()
    const { slug, customIgnored } = await allocateSlug(ctx, tx, input.customSlug)
    await tx.insert(shortLinks).values({ workspaceId: ctx.workspaceId, slug, domain: new URL(env().shortUrl).host, linkId: row!.id, source: 'vault' })
    const jobId = !input.title || !input.imageUrl || !input.priceIdr ? await enqueue(tx, 'links.unfurl', { linkId: row!.id, workspaceId: ctx.workspaceId, imageSourceUrl: input.imageSourceUrl ?? null }, { singletonKey: row!.id }) : null
    return { link: toLinkView(row!, { slug }), customIgnored, jobId }
  })
  if (input.showInBio !== false) { // on unless explicitly turned off
    // Loaded lazily: the bio module imports this one for short links.
    const { addProduct } = await import('../bio/service')
    await addProduct(ctx, result.link.id)
  }
  return result
}

export const linkPatchSchema = linkSchema.omit({ customSlug: true, showInBio: true, imageSourceUrl: true }).partial().extend({ archived: z.boolean().optional() })

export async function updateLink(ctx: WorkspaceContext, id: string, input: z.infer<typeof linkPatchSchema>) {
  assertAbility(ctx, 'links.manage')
  if (input.destinationUrl) await assertDestinationAllowed(ctx, input.destinationUrl)
  const [row] = await ctx.db.update(links).set({
    ...input,
    ...(input.destinationUrl && { merchant: detectMerchant(input.destinationUrl) }),
    updatedAt: new Date()
  }).where(and(eq(links.id, id), eq(links.workspaceId, ctx.workspaceId))).returning()
  if (!row) throw appError(404, 'Link tidak ditemukan.', 'NOT_FOUND')
  // Short link redirects pick up a new destination within the cache TTL (30 s).
  const [short] = await ctx.db.select({ slug: shortLinks.slug }).from(shortLinks).where(and(eq(shortLinks.linkId, id), eq(shortLinks.source, 'vault'))).limit(1)
  return toLinkView(row, short)
}

export const linkListSchema = z.object({ archived: z.enum(['true', 'false']).optional() })

export async function listLinks(ctx: WorkspaceContext, query: { page: number, limit: number, offset: number, search: string, all?: boolean } & z.infer<typeof linkListSchema>) {
  assertAbility(ctx, 'links.manage')
  const where = and(
    eq(links.workspaceId, ctx.workspaceId),
    eq(links.archived, query.archived === 'true'),
    query.search ? sql`(${links.title} ilike ${`%${query.search}%`} or ${links.destinationUrl} ilike ${`%${query.search}%`})` : undefined
  )
  const limit = query.all ? 200 : query.limit
  const [rows, [total]] = await Promise.all([
    ctx.db.select().from(links).where(where).orderBy(desc(links.createdAt)).limit(limit).offset(query.all ? 0 : query.offset),
    ctx.db.select({ n: count() }).from(links).where(where)
  ])
  const ids = rows.map(r => r.id)
  const [shorts, clicks] = ids.length
    ? await Promise.all([
        ctx.db.select({ linkId: shortLinks.linkId, slug: shortLinks.slug }).from(shortLinks).where(and(inArray(shortLinks.linkId, ids), eq(shortLinks.source, 'vault'))),
        ctx.db.select({ linkId: shortLinks.linkId, n: count() }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId))
          .where(and(eq(linkClicks.workspaceId, ctx.workspaceId), inArray(shortLinks.linkId, ids), eq(linkClicks.isBot, false), gte(linkClicks.clickedAt, new Date(Date.now() - 7 * 86_400_000))))
          .groupBy(shortLinks.linkId)
      ])
    : [[], []]
  const n = total?.n ?? 0
  return {
    items: rows.map(row => toLinkView(row, shorts.find(s => s.linkId === row.id), clicks.find(c => c.linkId === row.id)?.n ?? 0)),
    meta: { page: query.page, limit, total: n, pageCount: Math.max(1, Math.ceil(n / limit)) }
  }
}

export async function getLink(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'links.manage')
  const [row] = await ctx.db.select().from(links).where(and(eq(links.id, id), eq(links.workspaceId, ctx.workspaceId))).limit(1)
  if (!row) throw appError(404, 'Link tidak ditemukan.', 'NOT_FOUND')
  const [short] = await ctx.db.select({ slug: shortLinks.slug }).from(shortLinks).where(and(eq(shortLinks.linkId, id), eq(shortLinks.source, 'vault'))).limit(1)
  return toLinkView(row, short)
}

const shortUrlPattern = () => shortUrl('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Per-target attribution (ARCHITECTURE §10.2): at publish time, vault short URLs in a caption are swapped for
 * one short link per (target, product), so clicks are attributed to a post and a channel. Idempotent.
 */
export async function attributeCaption(db: Executor, target: { id: string, workspaceId: string, platform: string }, caption: string): Promise<string> {
  const base = shortUrlPattern()
  const vault = await vaultLinksIn(db, target.workspaceId, caption)
  let result = caption
  for (const entry of vault) {
    const [existing] = await db.select({ slug: shortLinks.slug }).from(shortLinks).where(and(eq(shortLinks.postTargetId, target.id), eq(shortLinks.linkId, entry.linkId))).limit(1)
    let slug = existing?.slug
    if (!slug) {
      slug = randomSlug()
      await db.insert(shortLinks).values({ workspaceId: target.workspaceId, slug, domain: new URL(env().shortUrl).host, linkId: entry.linkId, postTargetId: target.id, channel: target.platform, source: 'post' })
        .onConflictDoNothing()
      slug = (await db.select({ slug: shortLinks.slug }).from(shortLinks).where(and(eq(shortLinks.postTargetId, target.id), eq(shortLinks.linkId, entry.linkId))).limit(1))[0]?.slug ?? slug
    }
    result = result.replace(new RegExp(`${base}${entry.slug}(?![0-9A-Za-z_-])`, 'g'), shortUrl(slug))
  }
  return result
}

/** Products whose saved (vault) short link appears in a text, in order of first appearance. */
export async function vaultLinksIn(db: Executor, workspaceId: string, text: string): Promise<{ slug: string, linkId: string, url: string }[]> {
  const slugs = [...new Set([...text.matchAll(new RegExp(`${shortUrlPattern()}([0-9A-Za-z_-]{3,32})(?![0-9A-Za-z_-])`, 'g'))].map(m => m[1]!))]
  if (!slugs.length) return []
  const rows = await db.select({ slug: shortLinks.slug, linkId: shortLinks.linkId }).from(shortLinks)
    .where(and(eq(shortLinks.workspaceId, workspaceId), eq(shortLinks.source, 'vault'), inArray(shortLinks.slug, slugs)))
  return slugs.flatMap(slug => rows.filter(r => r.slug === slug).map(r => ({ ...r, url: shortUrl(r.slug) })))
}

/**
 * The products a post promotes: vault links still in its captions (before publishing) plus the per-target
 * attribution links publishing made (after). `vaultUrls` lets callers strip them from the text.
 */
export async function productLinksOfPost(db: Executor, workspaceId: string, postId: string, captions: string[]): Promise<{ linkIds: string[], vaultUrls: string[] }> {
  const vault = await vaultLinksIn(db, workspaceId, captions.join('\n'))
  const attributed = await db.select({ linkId: shortLinks.linkId }).from(shortLinks)
    .innerJoin(postTargets, eq(postTargets.id, shortLinks.postTargetId))
    .where(and(eq(shortLinks.workspaceId, workspaceId), eq(postTargets.postId, postId)))
  return { linkIds: [...new Set([...vault.map(v => v.linkId), ...attributed.map(a => a.linkId)])], vaultUrls: vault.map(v => v.url) }
}

/** A product's short link for a given source (Etalase button, auto-reply DM): one per (link, source). */
export async function shortLinkFor(db: Executor, workspaceId: string, linkId: string, source: 'bio' | 'dm'): Promise<{ id: string, slug: string }> {
  const [existing] = await db.select({ id: shortLinks.id, slug: shortLinks.slug }).from(shortLinks)
    .where(and(eq(shortLinks.workspaceId, workspaceId), eq(shortLinks.linkId, linkId), eq(shortLinks.source, source))).limit(1)
  if (existing) return existing
  const [row] = await db.insert(shortLinks).values({ workspaceId, slug: randomSlug(), domain: new URL(env().shortUrl).host, linkId, source }).returning({ id: shortLinks.id, slug: shortLinks.slug })
  return row!
}
