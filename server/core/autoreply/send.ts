import { and, count, eq, sql } from 'drizzle-orm'
import { composeDm, PRIVATE_REPLY_WINDOW_MS, type DmReason } from '../../../shared/utils/autoreply'
import { getAdapter } from '../channels/registry'
import type { CoreContext } from '../context'
import type { Database } from '../db/client'
import { dmEvents, dmRules, socialAccounts, workspaces } from '../db/schema'
import { countDmsThisMonth, limit } from '../entitlements'
import type { JobHandler } from '../jobs/types'
import { shortLinkFor, shortUrl } from '../links/service'
import { notifyWorkspaceOwners } from '../notifications'
import { consumeRateLimit } from '../rate-limit'
import { getSettingBool, getSettingNumber } from '../settings'
import { decryptAccount, markNeedsReauth } from '../social-accounts'

type DmEvent = typeof dmEvents.$inferSelect
type FinalStatus = 'skipped' | 'skipped_dup' | 'skipped_expired' | 'rate_limited' | 'failed'

const KILL_SWITCH_DEFER_MS = 10 * 60_000

async function settle(db: Database, id: string, status: FinalStatus | 'matched', error: DmReason | string | null) {
  await db.update(dmEvents).set({ status, error, updatedAt: new Date() }).where(eq(dmEvents.id, id))
}

/** One "Balas Otomatis dijeda" per workspace per month when the plan's DM allowance runs out. */
async function notifyPlanLimit(ctx: CoreContext, event: DmEvent, ruleName: string) {
  await notifyWorkspaceOwners(ctx, event.workspaceId, {
    templateKey: 'autoreply_paused',
    dedupeKey: `autoreply_paused:plan_limit:${event.workspaceId}:${new Date().toISOString().slice(0, 7)}`,
    variables: { ruleName, reason: 'Batas DM otomatis bulan ini sudah tercapai. Upgrade paket supaya komentar berikutnya tetap dibalas.' }
  })
}

/**
 * dm.send (ARCHITECTURE §9.2). Order: kill switch → 7-day window → one DM per commenter → plan allowance →
 * rule daily cap → account hourly cap → claim (status dm_sent, guarded by the partial unique index) → send.
 * The claim happens before the platform call, so a replayed or retried job can never send twice.
 */
export const dmSendJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const [event] = await db.select().from(dmEvents).where(eq(dmEvents.id, String(job.payload.dmEventId ?? ''))).limit(1)
  if (!event || event.status !== 'matched') return
  if (!event.ruleId) return settle(db, event.id, 'skipped', 'no_rule')

  const [[rule], [account], [ws]] = await Promise.all([
    db.select().from(dmRules).where(eq(dmRules.id, event.ruleId)).limit(1),
    db.select().from(socialAccounts).where(eq(socialAccounts.id, event.socialAccountId)).limit(1),
    db.select({ timezone: workspaces.timezone, status: workspaces.status }).from(workspaces).where(eq(workspaces.id, event.workspaceId)).limit(1)
  ])
  if (!rule || !rule.active) return settle(db, event.id, 'skipped', 'no_rule')
  if (!account || account.status !== 'active' || ws?.status !== 'active') return settle(db, event.id, 'skipped', 'account_inactive')

  if (Date.now() - event.createdAt.getTime() > PRIVATE_REPLY_WINDOW_MS) return settle(db, event.id, 'skipped_expired', null)
  if (!await getSettingBool('channels.autoReply.enabled', db)) {
    const until = new Date(Date.now() + KILL_SWITCH_DEFER_MS)
    if (until.getTime() - event.createdAt.getTime() > PRIVATE_REPLY_WINDOW_MS) return settle(db, event.id, 'skipped', 'kill_switch')
    return { deferUntil: until }
  }

  // Checks and claim run under a per-workspace lock, so concurrent sends can't all pass a cap at once.
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dm:${event.workspaceId}`}))`)
    const [already] = await tx.select({ n: count() }).from(dmEvents)
      .where(and(eq(dmEvents.ruleId, rule.id), eq(dmEvents.commenterId, event.commenterId), eq(dmEvents.status, 'dm_sent')))
    if ((already?.n ?? 0) > 0) return { kind: 'settle' as const, status: 'skipped_dup' as const, error: null }
    const monthly = await limit(event.workspaceId, 'autoReplyDmsPerMonth', tx)
    if (monthly !== -1 && await countDmsThisMonth(tx, event.workspaceId, ws.timezone) >= monthly) return { kind: 'settle' as const, status: 'rate_limited' as const, error: 'plan_limit' as const }
    if (rule.dailyCap) {
      const [today] = await tx.select({ n: count() }).from(dmEvents)
        .where(and(eq(dmEvents.ruleId, rule.id), eq(dmEvents.status, 'dm_sent'), sql`${dmEvents.updatedAt} > now() - interval '24 hours'`))
      if ((today?.n ?? 0) >= rule.dailyCap) return { kind: 'settle' as const, status: 'rate_limited' as const, error: 'daily_cap' as const }
    }
    const hourly = Math.max(1, Math.trunc(await getSettingNumber('channels.autoReply.maxDmsPerAccountPerHour', 60, tx)))
    const bucket = await consumeRateLimit(`dm:hour:${account.id}`, hourly, 3_600_000, tx)
    if (!bucket.allowed) return { kind: 'defer' as const, until: new Date(Date.now() + bucket.retryAfterSeconds * 1000) }
    // The claim: from here a retry or replay can never send again (partial unique index backs this up).
    const claimed = await tx.update(dmEvents).set({ status: 'dm_sent', error: null, updatedAt: new Date() })
      .where(and(eq(dmEvents.id, event.id), eq(dmEvents.status, 'matched'))).returning({ id: dmEvents.id })
    return { kind: claimed.length ? 'claimed' as const : 'gone' as const }
  })
  if (outcome.kind === 'gone') return
  if (outcome.kind === 'defer') {
    if (outcome.until.getTime() - event.createdAt.getTime() > PRIVATE_REPLY_WINDOW_MS) return settle(db, event.id, 'rate_limited', 'hourly_cap')
    return { deferUntil: outcome.until }
  }
  if (outcome.kind === 'settle') {
    await settle(db, event.id, outcome.status, outcome.error)
    if (outcome.error === 'plan_limit') await notifyPlanLimit(ctx, event, rule.name)
    return
  }

  const link = rule.linkId ? shortUrl((await shortLinkFor(db, event.workspaceId, rule.linkId, 'dm')).slug) : null
  const adapter = getAdapter('instagram')!
  const adapterCtx = { account: decryptAccount(account), fetch, log: ctx.log }
  try {
    await adapter.sendPrivateReply!(adapterCtx, event.commentId, composeDm(rule.dmMessage, { name: event.commenterUsername, link }))
  } catch (raw) {
    const error = adapter.normalizeError(raw)
    ctx.log.warn('dm.send_failed', { dmEventId: event.id, kind: error.kind, code: error.code })
    if (error.kind === 'auth') {
      await markNeedsReauth(db, account.id)
      await settle(db, event.id, 'failed', 'auth')
      return
    }
    if (error.kind === 'rate_limit' || error.kind === 'transient') {
      // The platform refused before sending: release the claim and try again later.
      await settle(db, event.id, 'matched', null)
      return { deferUntil: error.retryAfter ?? new Date(Date.now() + 15 * 60_000) }
    }
    await settle(db, event.id, 'failed', error.code ? `rejected:${error.code}`.slice(0, 100) : 'rejected')
    return
  }

  // Optional public reply, varied so Instagram doesn't see identical comments. Best effort.
  if (rule.publicReplyVariants.length && adapter.replyToComment) {
    const text = rule.publicReplyVariants[Math.floor(Math.random() * rule.publicReplyVariants.length)]!
    await adapter.replyToComment(adapterCtx, event.commentId, text).catch(raw => ctx.log.warn('dm.public_reply_failed', { dmEventId: event.id, kind: adapter.normalizeError(raw).kind }))
  }
}
