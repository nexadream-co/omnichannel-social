import { and, count, eq, inArray, lt, ne, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { PLATFORM_META } from '../../shared/channels/registry'
import type { Platform } from '../../shared/channels/types'
import { recordAudit } from './audit'
import type { ConnectedAccount, DecryptedSocialAccount } from './channels/adapter'
import { ChannelError } from './channels/adapter'
import { getAdapter } from './channels/registry'
import { assertAbility, type WorkspaceContext } from './context'
import { decrypt, encrypt, randomToken } from './crypto'
import type { Executor } from './db/client'
import { channelConnectSessions, jobs, postTargets, socialAccounts } from './db/schema'
import { assertWithinLimit, invalidateEntitlements } from './entitlements'
import { env } from './env'
import { appError } from './errors'
import { consumeRateLimit } from './rate-limit'

export const OAUTH_STATE_COOKIE = 'socialz_oauth'
const SESSION_TTL_MS = 15 * 60_000

const aad = (accountId: string, platform: Platform) => `${accountId}|${platform}`

export function redirectUri(platform: Platform): string {
  return `${env().siteUrl}/api/app/channels/${platform}/callback`
}

function adapterFor(platform: Platform) {
  const adapter = getAdapter(platform)
  if (!adapter) throw appError(404, `${PLATFORM_META[platform].name} segera hadir.`, 'NOT_FOUND')
  if (!adapter.isConfigured()) throw appError(503, `Menghubungkan ${PLATFORM_META[platform].name} belum tersedia. Coba lagi nanti.`, 'SERVICE_UNAVAILABLE')
  return adapter
}

/** Connecting hands us a token for someone's Instagram: owner-only, verified email, rate-limited (docs/blueprint/03 §4, 04 §2.1). */
export async function startConnect(ctx: WorkspaceContext & { emailVerified: boolean }, platform: Platform) {
  assertAbility(ctx, 'accounts.manage')
  if (!ctx.emailVerified) throw appError(403, 'Verifikasi email kamu dulu untuk menghubungkan akun media sosial.', 'EMAIL_NOT_VERIFIED')
  const adapter = adapterFor(platform)
  const limited = await consumeRateLimit(`oauth:channel:${ctx.userId}`, 20, 15 * 60_000, ctx.db)
  if (!limited.allowed) throw appError(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.', 'RATE_LIMITED', { retryAfterSeconds: limited.retryAfterSeconds })
  const state = randomToken(24)
  return { url: adapter.oauth.authorizeUrl(state, redirectUri(platform)), cookie: `${platform}.${state}` }
}

export function toView(row: typeof socialAccounts.$inferSelect) {
  return {
    id: row.id,
    platform: row.platform,
    username: row.username,
    avatarUrl: row.avatarUrl,
    status: row.status,
    tokenExpiresAt: row.tokenExpiresAt,
    createdAt: row.createdAt
  }
}

async function activeCount(db: Executor, workspaceId: string) {
  const [row] = await db.select({ n: count() }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.status, 'active')))
  return row?.n ?? 0
}

/**
 * Inserts new accounts (plan limit applies) and refreshes reconnected ones (no limit: same account).
 * An account already live in another workspace is refused, so webhooks route unambiguously.
 */
export async function connectAccounts(ctx: WorkspaceContext, platform: Platform, accounts: ConnectedAccount[]) {
  assertAbility(ctx, 'accounts.manage')
  const connected: string[] = []
  for (const account of accounts) {
    const [existing] = await ctx.db.select().from(socialAccounts)
      .where(and(eq(socialAccounts.platform, platform), eq(socialAccounts.externalId, account.externalId), ne(socialAccounts.status, 'revoked')))
      .limit(1)
    if (existing && existing.workspaceId !== ctx.workspaceId) {
      const name = [PLATFORM_META[platform].name, account.username].filter(Boolean).join(' ')
      throw appError(409, `${name} sudah terhubung ke akun Socialz.id lain.`, 'CONFLICT')
    }
    const id = existing?.id ?? uuidv7()
    const values = {
      username: account.username,
      avatarUrl: account.avatarUrl,
      accessTokenEnc: encrypt(account.accessToken, aad(id, platform)),
      refreshTokenEnc: account.refreshToken ? encrypt(account.refreshToken, aad(id, platform)) : null,
      tokenExpiresAt: account.tokenExpiresAt,
      scopes: account.scopes,
      meta: account.meta,
      status: 'active' as const,
      updatedAt: new Date()
    }
    if (existing) {
      // Reconnecting a disabled-by-plan account still counts against the limit.
      if (existing.status === 'disabled') await assertWithinLimit(ctx, 'socialAccounts', await activeCount(ctx.db, ctx.workspaceId))
      await ctx.db.update(socialAccounts).set(values).where(eq(socialAccounts.id, id))
      // Targets paused while the account needed reconnecting go back to scheduled (ARCHITECTURE §8.2).
      await ctx.db.update(postTargets).set({ status: 'scheduled', updatedAt: new Date() })
        .where(and(eq(postTargets.workspaceId, ctx.workspaceId), eq(postTargets.socialAccountId, id), eq(postTargets.status, 'needs_reauth')))
    } else {
      await assertWithinLimit(ctx, 'socialAccounts', await activeCount(ctx.db, ctx.workspaceId))
      await ctx.db.insert(socialAccounts).values({ id, workspaceId: ctx.workspaceId, platform, externalId: account.externalId, ...values })
    }
    connected.push(id)
    await recordAudit(ctx, { audience: 'creator', action: 'social_account.connect', workspaceId: ctx.workspaceId, targetType: 'social_account', targetId: id, metadata: { userId: ctx.userId, platform, username: account.username, reconnect: Boolean(existing) } })
  }
  await invalidateEntitlements(ctx.workspaceId, ctx.db)
  return { connected }
}

export type CallbackResult = { kind: 'connected', count: number } | { kind: 'pick', sessionId: string }

/** The OAuth callback: verify state, exchange the code, then connect directly or hand over to the picker. */
export async function handleConnectCallback(ctx: WorkspaceContext, platform: Platform, input: { code?: string, state?: string, error?: string }, cookie: string | undefined, fetchImpl: typeof fetch = fetch): Promise<CallbackResult> {
  assertAbility(ctx, 'accounts.manage')
  if (input.error) throw appError(400, 'Menghubungkan akun dibatalkan.', 'VALIDATION_FAILED', { reason: 'cancelled' })
  if (!input.code || !input.state || cookie !== `${platform}.${input.state}`) {
    throw appError(400, 'Sesi menghubungkan akun sudah berakhir. Coba lagi.', 'VALIDATION_FAILED', { reason: 'state' })
  }
  const adapter = adapterFor(platform)
  let accounts: ConnectedAccount[]
  try {
    accounts = await adapter.oauth.exchange(input.code, redirectUri(platform), fetchImpl)
  } catch (error) {
    const detail = adapter.normalizeError(error)
    ctx.log.warn('channels.exchange_failed', { platform, kind: detail.kind, code: detail.code })
    if (detail.code === 'PERSONAL_ACCOUNT') {
      throw appError(400, 'Akun Instagram pribadi belum bisa dipakai. Ubah ke akun Kreator atau Bisnis (gratis, 1 menit), lalu hubungkan lagi.', 'VALIDATION_FAILED', { reason: 'personal_account' })
    }
    throw appError(502, `${PLATFORM_META[platform].name} sedang tidak bisa dihubungi. Coba lagi sebentar lagi.`, 'SERVER_ERROR', { reason: 'exchange' })
  }
  if (!accounts.length) {
    throw appError(400, platform === 'facebook' ? 'Tidak ada Halaman Facebook yang bisa kamu kelola. Buat Halaman dulu, lalu hubungkan lagi.' : 'Tidak ada akun yang bisa dihubungkan.', 'VALIDATION_FAILED', { reason: 'no_accounts' })
  }
  if (accounts.length === 1) {
    const result = await connectAccounts(ctx, platform, accounts)
    return { kind: 'connected', count: result.connected.length }
  }
  const [session] = await ctx.db.insert(channelConnectSessions).values({
    workspaceId: ctx.workspaceId, userId: ctx.userId!, platform,
    payloadEnc: encrypt(JSON.stringify(accounts), `connect|${ctx.workspaceId}`),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS)
  }).returning({ id: channelConnectSessions.id })
  return { kind: 'pick', sessionId: session!.id }
}

async function loadSession(ctx: WorkspaceContext, sessionId: string) {
  const [row] = await ctx.db.select().from(channelConnectSessions)
    .where(and(eq(channelConnectSessions.id, sessionId), eq(channelConnectSessions.workspaceId, ctx.workspaceId), eq(channelConnectSessions.userId, ctx.userId ?? '')))
    .limit(1)
  if (!row || row.expiresAt < new Date()) throw appError(404, 'Sesi pilih akun sudah berakhir. Hubungkan lagi.', 'NOT_FOUND')
  // JSON round trip turns Dates into strings; revive them before they reach a timestamp column.
  const parsed = JSON.parse(decrypt(row.payloadEnc, `connect|${ctx.workspaceId}`) || '[]') as (Omit<ConnectedAccount, 'tokenExpiresAt'> & { tokenExpiresAt: string | null })[]
  const accounts: ConnectedAccount[] = parsed.map(a => ({ ...a, tokenExpiresAt: a.tokenExpiresAt ? new Date(a.tokenExpiresAt) : null }))
  return { row, accounts }
}

/** The picker shows names and pictures only, never tokens. */
export async function getConnectSession(ctx: WorkspaceContext, sessionId: string) {
  assertAbility(ctx, 'accounts.manage')
  const { row, accounts } = await loadSession(ctx, sessionId)
  const existing = await ctx.db.select({ externalId: socialAccounts.externalId }).from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, ctx.workspaceId), eq(socialAccounts.platform, row.platform), eq(socialAccounts.status, 'active')))
  const already = new Set(existing.map(e => e.externalId))
  return { platform: row.platform, accounts: accounts.map(a => ({ externalId: a.externalId, username: a.username, avatarUrl: a.avatarUrl, alreadyConnected: already.has(a.externalId) })) }
}

export async function completeConnectSession(ctx: WorkspaceContext, sessionId: string, externalIds: string[]) {
  assertAbility(ctx, 'accounts.manage')
  const { row, accounts } = await loadSession(ctx, sessionId)
  const chosen = accounts.filter(a => externalIds.includes(a.externalId))
  if (!chosen.length) throw appError(400, 'Pilih minimal satu akun.', 'VALIDATION_FAILED', { field: 'externalIds' })
  const result = await connectAccounts(ctx, row.platform, chosen)
  await ctx.db.delete(channelConnectSessions).where(eq(channelConnectSessions.id, sessionId))
  return { connected: result.connected.length }
}

export async function listSocialAccounts(ctx: WorkspaceContext) {
  assertAbility(ctx, 'posts.read')
  const rows = await ctx.db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, ctx.workspaceId), ne(socialAccounts.status, 'revoked')))
    .orderBy(socialAccounts.createdAt)
  return { items: rows.map(toView) }
}

/** Revokes our access: tokens deleted, history kept; scheduled posts on it go back to draft (docs/blueprint/05 §8). */
export async function disconnectSocialAccount(ctx: WorkspaceContext, id: string) {
  assertAbility(ctx, 'accounts.manage')
  const [row] = await ctx.db.select().from(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, ctx.workspaceId))).limit(1)
  if (!row || row.status === 'revoked') throw appError(404, 'Akun tidak ditemukan.', 'NOT_FOUND')
  await ctx.db.transaction(async (tx) => {
    await tx.update(socialAccounts).set({ status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null, updatedAt: new Date() }).where(eq(socialAccounts.id, id))
    const paused = await tx.update(postTargets).set({ status: 'draft', updatedAt: new Date() })
      .where(and(eq(postTargets.workspaceId, ctx.workspaceId), eq(postTargets.socialAccountId, id), inArray(postTargets.status, ['scheduled', 'quota_deferred', 'needs_reauth', 'retrying'])))
      .returning({ jobId: postTargets.jobId })
    const jobIds = paused.map(p => p.jobId).filter((j): j is string => Boolean(j))
    if (jobIds.length) await tx.update(jobs).set({ status: 'cancelled', finishedAt: new Date() }).where(and(inArray(jobs.id, jobIds), eq(jobs.status, 'queued')))
  })
  await recordAudit(ctx, { audience: 'creator', action: 'social_account.disconnect', workspaceId: ctx.workspaceId, targetType: 'social_account', targetId: id, metadata: { userId: ctx.userId, platform: row.platform } })
  await invalidateEntitlements(ctx.workspaceId, ctx.db)
  return { success: true }
}

/** Tokens are decrypted only here, right before an adapter call (docs/blueprint/16 §3). */
export function decryptAccount(row: typeof socialAccounts.$inferSelect): DecryptedSocialAccount {
  const accessToken = decrypt(row.accessTokenEnc, aad(row.id, row.platform))
  if (!accessToken) throw new ChannelError({ kind: 'auth', code: 'NO_TOKEN', message: 'Token missing or undecryptable' })
  return {
    id: row.id, platform: row.platform, externalId: row.externalId, accessToken,
    refreshToken: row.refreshTokenEnc ? decrypt(row.refreshTokenEnc, aad(row.id, row.platform)) || null : null,
    meta: row.meta
  }
}

/** Marks an account needs_reauth and pauses its targets; the caller notifies (deduped per day). */
export async function markNeedsReauth(db: Executor, accountId: string) {
  await db.update(socialAccounts).set({ status: 'needs_reauth', updatedAt: new Date() }).where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.status, 'active')))
  await db.update(postTargets).set({ status: 'needs_reauth', updatedAt: new Date() })
    .where(and(eq(postTargets.socialAccountId, accountId), inArray(postTargets.status, ['scheduled', 'retrying', 'quota_deferred'])))
}

/** Accounts whose token expires within N days (token.refresh fan-out). */
export async function accountsExpiringWithin(db: Executor, days: number) {
  return db.select({ id: socialAccounts.id, workspaceId: socialAccounts.workspaceId }).from(socialAccounts)
    .where(and(eq(socialAccounts.status, 'active'), lt(socialAccounts.tokenExpiresAt, sql`now() + make_interval(days => ${days})`)))
}
