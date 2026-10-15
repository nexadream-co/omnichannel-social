import { eq } from 'drizzle-orm'
import { PLATFORM_META } from '../../../../shared/channels/registry'
import { getAdapter } from '../../channels/registry'
import type { Database } from '../../db/client'
import { socialAccounts } from '../../db/schema'
import { encrypt } from '../../crypto'
import { notifyWorkspaceOwners } from '../../notifications'
import { accountsExpiringWithin, decryptAccount, markNeedsReauth } from '../../social-accounts'
import { todayKey } from '../../timezone'
import { enqueue } from '../enqueue'
import type { JobHandler } from '../types'

const REFRESH_WINDOW_DAYS = 10

/** Hourly: one singleton job per account whose token expires within 10 days (docs/blueprint/15 §3.4). */
export const tokenRefresh: JobHandler = async (_job, ctx) => {
  const db = ctx.db as Database
  for (const account of await accountsExpiringWithin(db, REFRESH_WINDOW_DAYS)) {
    await enqueue(db, 'token.refresh.one', { socialAccountId: account.id, workspaceId: account.workspaceId }, { singletonKey: account.id })
  }
}

export const tokenRefreshOne: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const [row] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, String(job.payload.socialAccountId))).limit(1)
  if (!row || row.status !== 'active') return
  const adapter = getAdapter(row.platform)
  if (!adapter?.oauth.refresh) return // e.g. Facebook Page tokens don't expire
  try {
    const account = decryptAccount(row)
    const next = await adapter.oauth.refresh({ accessToken: account.accessToken, refreshToken: account.refreshToken, tokenExpiresAt: row.tokenExpiresAt }, fetch)
    const aad = `${row.id}|${row.platform}`
    await db.update(socialAccounts).set({
      accessTokenEnc: encrypt(next.accessToken, aad),
      refreshTokenEnc: next.refreshToken ? encrypt(next.refreshToken, aad) : row.refreshTokenEnc,
      tokenExpiresAt: next.tokenExpiresAt,
      updatedAt: new Date()
    }).where(eq(socialAccounts.id, row.id))
  } catch (error) {
    const detail = adapter.normalizeError(error)
    if (detail.kind !== 'auth' && detail.kind !== 'validation' && detail.kind !== 'permanent') throw error // transient: retry with backoff
    await markNeedsReauth(db, row.id)
    await notifyWorkspaceOwners(ctx, row.workspaceId, {
      templateKey: 'account_reconnect_needed',
      // At most once per account per day, even if several jobs fail (docs/blueprint/11 §2).
      dedupeKey: `account_reconnect_needed:${row.id}:${todayKey()}`,
      variables: { platformLabel: PLATFORM_META[row.platform].name, accountName: row.username ?? '', reconnectUrl: '/app/accounts' }
    })
  }
}
