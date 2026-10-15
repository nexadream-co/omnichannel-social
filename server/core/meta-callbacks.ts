import { createHmac } from 'node:crypto'
import { and, eq, or, sql } from 'drizzle-orm'
import { recordAudit } from './audit'
import type { CoreContext } from './context'
import type { Database } from './db/client'
import { dataDeletionRequests, dmEvents, socialAccounts } from './db/schema'
import { env } from './env'
import { randomToken, safeEqual } from './crypto'
import { appError } from './errors'
import { enqueue } from './jobs/enqueue'
import { kick } from './jobs/runner'
import type { JobHandler } from './jobs/types'

type MetaPlatform = 'facebook' | 'instagram' | 'threads'

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Parses Meta's signed_request (base64url payload, HMAC-SHA256 with the app secret). Each Meta app signs
 * with its own secret, so the secret that verifies tells us which platform sent it (ARCHITECTURE §9.4).
 */
export function parseSignedRequest(signedRequest: string, secrets: Partial<Record<MetaPlatform, string>>): { platform: MetaPlatform, userId: string } | null {
  const [signature, payload] = signedRequest.split('.')
  if (!signature || !payload) return null
  const expected = base64UrlDecode(signature).toString('hex')
  for (const [platform, secret] of Object.entries(secrets) as [MetaPlatform, string][]) {
    if (!secret) continue
    const actual = createHmac('sha256', secret).update(payload).digest('hex')
    if (!safeEqual(actual, expected)) continue
    try {
      const data = JSON.parse(base64UrlDecode(payload).toString('utf8')) as { algorithm?: string, user_id?: string | number }
      if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256' || data.user_id === undefined) return null
      return { platform, userId: String(data.user_id) }
    } catch {
      return null
    }
  }
  return null
}

function metaSecrets() {
  const config = env()
  return { facebook: config.META_APP_SECRET, instagram: config.INSTAGRAM_APP_SECRET, threads: config.THREADS_APP_SECRET }
}

function accountsOf(platform: MetaPlatform, userId: string) {
  return and(eq(socialAccounts.platform, platform), or(eq(socialAccounts.externalId, userId), sql`${socialAccounts.meta}->>'userId' = ${userId}`))
}

/** POST /api/meta/data-deletion → { url, confirmation_code } */
export async function handleDataDeletion(ctx: CoreContext & { db: Database }, signedRequest: string) {
  const parsed = parseSignedRequest(signedRequest, metaSecrets())
  if (!parsed) throw appError(400, 'Permintaan tidak valid.', 'VALIDATION_FAILED')
  const confirmationCode = randomToken(8)
  const jobId = await ctx.db.transaction(async (tx) => {
    const [request] = await tx.insert(dataDeletionRequests).values({ platform: parsed.platform, platformUserId: parsed.userId, confirmationCode }).returning({ id: dataDeletionRequests.id })
    return enqueue(tx, 'meta.data_deletion', { requestId: request!.id })
  })
  ctx.defer(kick(ctx, [jobId]))
  await recordAudit(ctx, { audience: 'creator', action: 'meta.data_deletion', metadata: { platform: parsed.platform, confirmationCode } })
  return { url: `${env().siteUrl}/legal/data-deletion?code=${confirmationCode}`, confirmation_code: confirmationCode }
}

/** POST /api/meta/deauthorize: the person removed the app; revoke the account right away. */
export async function handleDeauthorize(ctx: CoreContext & { db: Database }, signedRequest: string) {
  const parsed = parseSignedRequest(signedRequest, metaSecrets())
  if (!parsed) throw appError(400, 'Permintaan tidak valid.', 'VALIDATION_FAILED')
  const revoked = await ctx.db.update(socialAccounts)
    .set({ status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null, updatedAt: new Date() })
    .where(accountsOf(parsed.platform, parsed.userId))
    .returning({ id: socialAccounts.id, workspaceId: socialAccounts.workspaceId })
  for (const account of revoked) {
    await recordAudit(ctx, { audience: 'creator', action: 'meta.deauthorize', workspaceId: account.workspaceId, targetType: 'social_account', targetId: account.id, metadata: { platform: parsed.platform } })
  }
  return { success: true }
}

/** Job: purge tokens, DM events and profile details of the person's accounts, then mark the request completed. */
export const dataDeletionJob: JobHandler = async (job, ctx) => {
  const db = ctx.db as Database
  const requestId = String(job.payload.requestId)
  const [request] = await db.select().from(dataDeletionRequests).where(eq(dataDeletionRequests.id, requestId))
  if (!request || request.status === 'completed') return
  if (request.platform !== 'facebook' && request.platform !== 'instagram' && request.platform !== 'threads') return
  await db.transaction(async (tx) => {
    const accounts = await tx.update(socialAccounts)
      .set({ status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null, username: null, avatarUrl: null, meta: {}, updatedAt: new Date() })
      .where(accountsOf(request.platform as MetaPlatform, request.platformUserId))
      .returning({ id: socialAccounts.id })
    for (const account of accounts) await tx.delete(dmEvents).where(eq(dmEvents.socialAccountId, account.id))
    await tx.update(dataDeletionRequests).set({ status: 'completed', updatedAt: new Date() }).where(eq(dataDeletionRequests.id, requestId))
  })
}

/** Public status for /legal/data-deletion?code= */
export async function dataDeletionStatus(db: Database, code: string) {
  const [row] = await db.select({ status: dataDeletionRequests.status, createdAt: dataDeletionRequests.createdAt, updatedAt: dataDeletionRequests.updatedAt })
    .from(dataDeletionRequests).where(eq(dataDeletionRequests.confirmationCode, code)).limit(1)
  if (!row) throw appError(404, 'Kode konfirmasi tidak ditemukan.', 'NOT_FOUND')
  return row
}
