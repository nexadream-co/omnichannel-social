import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import { getAdapter } from './channels/registry'
import type { CoreContext } from './context'
import type { Database } from './db/client'
import { insightSnapshots, postTargets, socialAccounts, users, workspaceMembers, workspaces } from './db/schema'
import { sendTemplatedEmail } from './email'
import { env } from './env'
import type { JobHandler } from './jobs/types'
import { decryptAccount, markNeedsReauth } from './social-accounts'

type Ctx = CoreContext & { db: Database }

const INSIGHTS_WINDOW_DAYS = 30
const INSIGHTS_BATCH = 25

/**
 * insights.daily, 02:30 WIB (docs/blueprint/15 §3.6): one metrics snapshot per published post target from the
 * last 30 days, per day. Idempotent: a target that already has today's snapshot is skipped, so a doubled tick
 * or a manual run costs nothing. One account's failure never stops the others.
 */
export const insightsDailyJob: JobHandler = async (_job, base) => {
  const ctx = base as Ctx
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const dayStart = new Date(`${today}T00:00:00+07:00`)
  const accounts = await ctx.db.select().from(socialAccounts).where(eq(socialAccounts.status, 'active'))
  const summary = { accounts: 0, snapshots: 0, failed: 0 }
  for (const account of accounts) {
    const adapter = getAdapter(account.platform)
    if (!adapter?.fetchInsights) continue
    const targets = await ctx.db.select({ id: postTargets.id, externalId: postTargets.externalId, workspaceId: postTargets.workspaceId }).from(postTargets)
      .where(and(
        eq(postTargets.socialAccountId, account.id), eq(postTargets.status, 'published'), isNotNull(postTargets.externalId),
        gte(postTargets.publishedAt, new Date(Date.now() - INSIGHTS_WINDOW_DAYS * 86_400_000)),
        sql`not exists (select 1 from insight_snapshots s where s.post_target_id = ${postTargets.id} and s.captured_at >= ${dayStart})`
      )).orderBy(desc(postTargets.publishedAt)).limit(200)
    if (!targets.length) continue
    summary.accounts++
    try {
      const adapterCtx = { account: decryptAccount(account), fetch, log: ctx.log }
      for (let i = 0; i < targets.length; i += INSIGHTS_BATCH) {
        const batch = targets.slice(i, i + INSIGHTS_BATCH)
        const rows = await adapter.fetchInsights(adapterCtx, batch.map(t => t.externalId!))
        const byExternal = new Map(rows.map(r => [r.externalId, r.metrics]))
        const values = batch.filter(t => byExternal.has(t.externalId!)).map(t => ({ workspaceId: t.workspaceId, postTargetId: t.id, metrics: byExternal.get(t.externalId!)! }))
        if (values.length) await ctx.db.insert(insightSnapshots).values(values)
        summary.snapshots += values.length
      }
    } catch (raw) {
      summary.failed++
      const error = adapter.normalizeError(raw)
      if (error.kind === 'auth') await markNeedsReauth(ctx.db, account.id)
      ctx.log.warn('insights.account_failed', { socialAccountId: account.id, kind: error.kind, code: error.code })
    }
  }
  ctx.log.info('insights.daily', summary)
}

export const INACTIVITY_EMAIL_DAYS = 10

/**
 * engagement.inactivity, 07:00 WIB (docs/blueprint/15 §3.3): owners whose last activity fell on the local day
 * exactly 10 days ago get one win-back email. Stateless: the daily slot claim is the only dedupe needed.
 */
export const inactivityJob: JobHandler = async (_job, base) => {
  const ctx = base as Ctx
  const owners = await ctx.db.select({ email: users.email, name: users.name, workspaceName: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(
      eq(workspaceMembers.role, 'owner'), eq(workspaceMembers.isActive, true), eq(users.isActive, true),
      eq(workspaces.status, 'active'), sql`${workspaces.deletedAt} is null`,
      sql`(coalesce(${users.lastSeenAt}, ${users.lastLoginAt}) at time zone ${workspaces.timezone})::date = (now() at time zone ${workspaces.timezone})::date - ${INACTIVITY_EMAIL_DAYS}::int`
    ))
  for (const owner of owners) {
    ctx.defer(sendTemplatedEmail(ctx, 'inactivity_winback', owner.email, { name: owner.name, workspaceName: owner.workspaceName, days: INACTIVITY_EMAIL_DAYS, appUrl: `${env().siteUrl}/app/compose` }))
  }
  ctx.log.info('engagement.inactivity', { emailed: owners.length })
}

/** Latest snapshot per target (post detail numbers). */
export async function latestInsights(db: Database, targetIds: string[]): Promise<Map<string, { metrics: Record<string, number>, capturedAt: Date }>> {
  if (!targetIds.length) return new Map()
  const rows = await db.selectDistinctOn([insightSnapshots.postTargetId], { postTargetId: insightSnapshots.postTargetId, metrics: insightSnapshots.metrics, capturedAt: insightSnapshots.capturedAt })
    .from(insightSnapshots).where(inArray(insightSnapshots.postTargetId, targetIds)).orderBy(insightSnapshots.postTargetId, desc(insightSnapshots.capturedAt))
  return new Map(rows.map(r => [r.postTargetId, { metrics: r.metrics as Record<string, number>, capturedAt: r.capturedAt }]))
}
