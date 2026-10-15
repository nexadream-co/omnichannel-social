import { and, asc, count, desc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { commentMatches, composeDm, MAX_KEYWORDS, MAX_PUBLIC_REPLIES, normalizeKeywords, type DmMatchMode } from '../../../shared/utils/autoreply'
import { getAdapter } from '../channels/registry'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Executor } from '../db/client'
import { dmEvents, dmRules, linkClicks, links, mediaAssets, postMedia, postTargets, posts, shortLinks, socialAccounts } from '../db/schema'
import { assertWithinLimit } from '../entitlements'
import { appError } from '../errors'
import { shortLinkFor, shortUrl } from '../links/service'
import { decryptAccount } from '../social-accounts'

type Rule = typeof dmRules.$inferSelect

/** Post-scoped rules for this post first, then "semua postingan" rules; oldest first within each (ARCHITECTURE §9.2). */
export async function findMatchingRule(db: Executor, socialAccountId: string, mediaId: string | null, text: string): Promise<Rule | null> {
  const rules = await db.select().from(dmRules)
    .where(and(eq(dmRules.socialAccountId, socialAccountId), eq(dmRules.active, true)))
    .orderBy(sql`case when ${dmRules.scope} = 'post' then 0 else 1 end`, asc(dmRules.createdAt))
  return rules.find(rule => (rule.scope === 'global' || (mediaId && rule.externalMediaId === mediaId)) && commentMatches(text, rule.keywords, rule.matchMode as DmMatchMode)) ?? null
}

export const ruleSchema = z.object({
  socialAccountId: z.string().min(1, 'Pilih akun Instagram.'),
  name: z.string().trim().max(80).optional(),
  scope: z.enum(['post', 'global']).default('global'),
  externalMediaId: z.string().max(100).nullable().optional(),
  keywords: z.array(z.string().trim().max(40)).max(MAX_KEYWORDS, `Maksimal ${MAX_KEYWORDS} kata kunci.`).default([]),
  matchMode: z.enum(['exact', 'contains']).default('contains'),
  dmMessage: z.string().trim().min(1, 'Tulis pesan yang dikirim lewat DM.').max(1000),
  linkId: z.string().nullable().optional(),
  publicReplyVariants: z.array(z.string().trim().min(1).max(150)).max(MAX_PUBLIC_REPLIES).default([]),
  dailyCap: z.number().int().min(1).max(1000).nullable().optional(),
  active: z.boolean().default(true)
})
export type RuleInput = z.infer<typeof ruleSchema>

async function assertAccount(ctx: WorkspaceContext, accountId: string) {
  const [account] = await ctx.db.select().from(socialAccounts).where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.workspaceId, ctx.workspaceId))).limit(1)
  if (!account || account.platform !== 'instagram') throw appError(400, 'Balas Otomatis hanya untuk akun Instagram.', 'VALIDATION_FAILED', { field: 'socialAccountId' })
  return account
}

async function assertLink(ctx: WorkspaceContext, linkId: string) {
  const [link] = await ctx.db.select({ id: links.id }).from(links).where(and(eq(links.id, linkId), eq(links.workspaceId, ctx.workspaceId))).limit(1)
  if (!link) throw appError(404, 'Link produk tidak ditemukan.', 'NOT_FOUND', { field: 'linkId' })
}

/** Turning a rule on counts against autoReplyRules (role 403 first, then plan 402). */
async function assertActivationAllowed(ctx: WorkspaceContext, exceptId?: string) {
  const [row] = await ctx.db.select({ n: count() }).from(dmRules)
    .where(and(eq(dmRules.workspaceId, ctx.workspaceId), eq(dmRules.active, true), exceptId ? ne(dmRules.id, exceptId) : undefined))
  await assertWithinLimit(ctx, 'autoReplyRules', row?.n ?? 0)
}

function values(input: RuleInput) {
  const keywords = normalizeKeywords(input.keywords)
  if (input.scope === 'post' && !input.externalMediaId) throw appError(400, 'Pilih postingannya, atau pilih "Semua postingan".', 'VALIDATION_FAILED', { field: 'externalMediaId' })
  if (input.scope === 'global' && !keywords.length) throw appError(400, 'Untuk semua postingan, isi minimal satu kata kunci supaya tidak semua komentar dibalas.', 'VALIDATION_FAILED', { field: 'keywords' })
  return {
    socialAccountId: input.socialAccountId,
    name: input.name?.trim() || (keywords.length ? `Komentar "${keywords[0]}"` : 'Semua komentar'),
    scope: input.scope,
    externalMediaId: input.scope === 'post' ? input.externalMediaId ?? null : null,
    keywords,
    matchMode: input.matchMode,
    dmMessage: input.dmMessage,
    linkId: input.linkId ?? null,
    publicReplyVariants: [...new Set(input.publicReplyVariants)],
    dailyCap: input.dailyCap ?? null,
    active: input.active
  }
}

export async function createRule(ctx: WorkspaceContext, input: RuleInput) {
  assertAbility(ctx, 'autoreply.manage')
  await assertAccount(ctx, input.socialAccountId)
  if (input.linkId) await assertLink(ctx, input.linkId)
  const row = values(input)
  if (row.active) await assertActivationAllowed(ctx)
  const [rule] = await ctx.db.insert(dmRules).values({ ...row, workspaceId: ctx.workspaceId }).returning()
  return rule!
}

export async function getRule(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'autoreply.manage')
  const [rule] = await ctx.db.select().from(dmRules).where(and(eq(dmRules.id, id), eq(dmRules.workspaceId, ctx.workspaceId))).limit(1)
  if (!rule) throw appError(404, 'Aturan tidak ditemukan.', 'NOT_FOUND')
  return rule
}

export async function updateRule(ctx: WorkspaceContext, id: string, input: RuleInput) {
  const existing = await getRule(ctx, id)
  await assertAccount(ctx, input.socialAccountId)
  if (input.linkId) await assertLink(ctx, input.linkId)
  const row = values(input)
  if (row.active && !existing.active) await assertActivationAllowed(ctx, id)
  const [rule] = await ctx.db.update(dmRules).set({ ...row, pausedReason: row.active ? null : existing.pausedReason, updatedAt: new Date() }).where(eq(dmRules.id, id)).returning()
  return rule!
}

export async function setRuleActive(ctx: WorkspaceContext, id: string, active: boolean) {
  const existing = await getRule(ctx, id)
  if (active && !existing.active) await assertActivationAllowed(ctx, id)
  const [rule] = await ctx.db.update(dmRules).set({ active, pausedReason: active ? null : existing.pausedReason, updatedAt: new Date() }).where(eq(dmRules.id, id)).returning()
  return rule!
}

/** History stays: events keep their text, the rule link is cleared. */
export async function deleteRule(ctx: WorkspaceContext, id: string) {
  await getRule(ctx, id)
  await ctx.db.transaction(async (tx) => {
    await tx.update(dmEvents).set({ ruleId: null }).where(and(eq(dmEvents.ruleId, id), eq(dmEvents.workspaceId, ctx.workspaceId)))
    await tx.delete(dmRules).where(and(eq(dmRules.id, id), eq(dmRules.workspaceId, ctx.workspaceId)))
  })
}

export async function listRules(ctx: WorkspaceContext) {
  assertAbility(ctx, 'autoreply.manage')
  const rows = await ctx.db.select({
    rule: dmRules, linkTitle: links.title, linkImage: links.imageUrl, accountUsername: socialAccounts.username, accountStatus: socialAccounts.status,
    sent: sql<number>`(select count(*)::int from dm_events e where e.rule_id = ${dmRules.id} and e.status = 'dm_sent')`,
    sent7d: sql<number>`(select count(*)::int from dm_events e where e.rule_id = ${dmRules.id} and e.status = 'dm_sent' and e.created_at > now() - interval '7 days')`
  }).from(dmRules)
    .leftJoin(links, eq(links.id, dmRules.linkId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, dmRules.socialAccountId))
    .where(eq(dmRules.workspaceId, ctx.workspaceId)).orderBy(desc(dmRules.active), desc(dmRules.createdAt))
  return rows.map(({ rule, ...rest }) => ({
    id: rule.id, name: rule.name, scope: rule.scope, externalMediaId: rule.externalMediaId, keywords: rule.keywords, active: rule.active, pausedReason: rule.pausedReason,
    linkId: rule.linkId, ...rest
  }))
}

/** The editor's "Coba" button: would this comment trigger the rule, and what would the DM say? Nothing is sent. */
export async function testRule(ctx: WorkspaceContext, input: Pick<RuleInput, 'keywords' | 'matchMode' | 'dmMessage' | 'linkId'> & { comment: string }) {
  assertAbility(ctx, 'autoreply.manage')
  const matches = commentMatches(input.comment, normalizeKeywords(input.keywords), input.matchMode)
  let link: string | null = null
  if (input.linkId) {
    await assertLink(ctx, input.linkId)
    link = shortUrl((await shortLinkFor(ctx.db, ctx.workspaceId, input.linkId, 'dm')).slug)
  }
  return { matches, message: matches ? composeDm(input.dmMessage, { name: 'pengikutmu', link }) : null }
}

export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  ruleId: z.string().optional(),
  status: z.enum(['all', 'sent', 'skipped']).default('all')
})

export async function listActivity(ctx: WorkspaceContext, query: z.infer<typeof activityQuerySchema>) {
  assertAbility(ctx, 'autoreply.manage')
  const where = and(
    eq(dmEvents.workspaceId, ctx.workspaceId),
    query.ruleId ? eq(dmEvents.ruleId, query.ruleId) : undefined,
    query.status === 'sent' ? eq(dmEvents.status, 'dm_sent') : query.status === 'skipped' ? ne(dmEvents.status, 'dm_sent') : undefined
  )
  const [items, [total], [clicks]] = await Promise.all([
    ctx.db.select({
      id: dmEvents.id, ruleId: dmEvents.ruleId, ruleName: dmRules.name, commenterUsername: dmEvents.commenterUsername, commentText: dmEvents.commentText,
      status: dmEvents.status, error: dmEvents.error, createdAt: dmEvents.createdAt
    }).from(dmEvents).leftJoin(dmRules, eq(dmRules.id, dmEvents.ruleId)).where(where)
      .orderBy(desc(dmEvents.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(dmEvents).where(where),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(linkClicks).innerJoin(shortLinks, eq(shortLinks.id, linkClicks.shortLinkId))
      .where(and(eq(linkClicks.workspaceId, ctx.workspaceId), eq(shortLinks.source, 'dm'), eq(linkClicks.isBot, false), sql`${linkClicks.clickedAt} > now() - interval '30 days'`))
  ])
  const n = total?.n ?? 0
  return { items, meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) }, dmClicks30d: clicks?.n ?? 0 }
}

/**
 * Step 1 of the editor: the account's recent posts. Our own published posts carry a thumbnail; posts made
 * outside Socialz.id come from the platform. A platform failure just shows our own posts.
 */
export async function recentMedia(ctx: WorkspaceContext, accountId: string) {
  assertAbility(ctx, 'autoreply.manage')
  const account = await assertAccount(ctx, accountId)
  const ours = await ctx.db.select({
    externalId: postTargets.externalId, caption: posts.baseCaption, publishedAt: postTargets.publishedAt,
    thumb: sql<string | null>`(select ${mediaAssets.publicUrl} from ${postMedia} join ${mediaAssets} on ${mediaAssets.id} = ${postMedia.mediaId} where ${postMedia.postId} = ${posts.id} and ${mediaAssets.kind} = 'image' order by ${postMedia.position} limit 1)`
  }).from(postTargets).innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(eq(postTargets.socialAccountId, account.id), eq(postTargets.status, 'published'), sql`${postTargets.externalId} is not null`))
    .orderBy(desc(postTargets.publishedAt)).limit(30)
  const byId = new Map(ours.map(row => [row.externalId!, { externalId: row.externalId!, caption: row.caption, at: row.publishedAt, thumbUrl: row.thumb }]))
  const adapter = getAdapter('instagram')
  if (adapter && account.status === 'active') {
    try {
      const remote = await adapter.findRecent({ account: decryptAccount(account), fetch, log: ctx.log }, new Date(Date.now() - 60 * 86_400_000))
      for (const item of remote) if (!byId.has(item.externalId)) byId.set(item.externalId, { externalId: item.externalId, caption: item.caption, at: item.ts, thumbUrl: null })
    } catch (error) {
      ctx.log.warn('autoreply.recent_media_failed', { error })
    }
  }
  return [...byId.values()].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)).slice(0, 30)
}
