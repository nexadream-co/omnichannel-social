import { createHash } from 'node:crypto'
import { and, count, desc, eq, ilike, isNotNull, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { recordAudit } from './audit'
import { assertPermission, type CoreContext, type StaffContext } from './context'
import { paymentWebhookEvents } from './db/schema'
import { appError } from './errors'
import { applyPayment, normalizeCallback } from './payment-apply'
import { getGatewayCredentials, getPaymentDriver, isSupportedProvider } from './services/payments'

type Ctx = Pick<CoreContext, 'db' | 'log' | 'defer'>
const SAFE_HEADERS = ['content-type', 'user-agent', 'x-forwarded-for', 'cf-connecting-ip']

/**
 * POST /api/webhooks/payments/:provider (docs/blueprint/08 §6). Persist first (deduped), then apply.
 * Callbacks for another platform's orders on the shared merchant are normal: stored, 200, nothing applied.
 */
export async function receivePaymentWebhook(ctx: Ctx, provider: string, payload: Record<string, unknown>, headers: Record<string, string | undefined>) {
  if (!isSupportedProvider(provider)) throw appError(404, 'Not found', 'NOT_FOUND')
  const creds = await getGatewayCredentials(provider, ctx.db)
  if (!creds) throw appError(503, 'Not configured', 'SERVER_ERROR')
  const driver = getPaymentDriver(provider)
  if (driver.trustsWebhookPayload && !driver.verifyWebhook(creds, payload, headers)) throw appError(401, 'Unauthorized', 'UNAUTHENTICATED')

  const gatewayOrderId = driver.webhookOrderId(payload)
  const dedupeKey = `${provider}:${createHash('sha256').update(driver.webhookDedupeSource(payload)).digest('hex')}`
  await ctx.db.insert(paymentWebhookEvents).values({
    provider, dedupeKey, orderId: gatewayOrderId, payload,
    headers: Object.fromEntries(SAFE_HEADERS.filter(h => headers[h]).map(h => [h, headers[h]]))
  }).onConflictDoNothing()
  const [record] = await ctx.db.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.dedupeKey, dedupeKey)).limit(1)
  if (record!.processedAt) return { received: true, duplicate: true }

  try {
    const normalized = await normalizeCallback(ctx, driver, creds, payload)
    if (!normalized) {
      await ctx.db.update(paymentWebhookEvents).set({ processedAt: new Date(), error: 'unknown order' }).where(eq(paymentWebhookEvents.id, record!.id))
      return { received: true, applied: false }
    }
    const result = await applyPayment(ctx, normalized)
    await ctx.db.update(paymentWebhookEvents).set({
      processedAt: new Date(), orderId: gatewayOrderId ?? normalized.orderId, error: result.applied || result.noop ? null : result.reason ?? null
    }).where(eq(paymentWebhookEvents.id, record!.id))
    return { received: true, applied: result.applied }
  } catch (error) {
    await ctx.db.update(paymentWebhookEvents).set({ error: (error as Error).message.slice(0, 500) }).where(eq(paymentWebhookEvents.id, record!.id))
    throw appError(500, 'Callback could not be applied', 'SERVER_ERROR')
  }
}

export const webhookEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default(''),
  state: z.enum(['all', 'processed', 'error', 'pending']).default('all')
})

/** /admin/webhook-events: what the gateway said next to what we did. */
export async function listPaymentWebhookEvents(ctx: StaffContext, query: z.infer<typeof webhookEventsQuerySchema>) {
  assertPermission(ctx, 'payments.read')
  const where = and(
    query.search ? ilike(paymentWebhookEvents.orderId, `%${query.search}%`) : undefined,
    query.state === 'processed' ? and(isNotNull(paymentWebhookEvents.processedAt), isNull(paymentWebhookEvents.error)) : undefined,
    query.state === 'error' ? isNotNull(paymentWebhookEvents.error) : undefined,
    query.state === 'pending' ? isNull(paymentWebhookEvents.processedAt) : undefined
  )
  const [rows, [total]] = await Promise.all([
    ctx.db.select().from(paymentWebhookEvents).where(where).orderBy(desc(paymentWebhookEvents.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(paymentWebhookEvents).where(where)
  ])
  const n = total?.n ?? 0
  return {
    items: rows.map(row => ({
      id: row.id, provider: row.provider, orderId: row.orderId, processedAt: row.processedAt, error: row.error, replayCount: row.replayCount, createdAt: row.createdAt,
      gatewayStatus: isSupportedProvider(row.provider) ? getPaymentDriver(row.provider).webhookStatus(row.payload as Record<string, unknown>) : null,
      payload: row.payload
    })),
    meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) }
  }
}

/** 08 §7: replay re-reads the live status (safer than re-applying a stale payload). Pressing twice is safe. */
export async function replayPaymentWebhook(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'payments.write')
  const [row] = await ctx.db.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.id, id)).limit(1)
  if (!row) throw appError(404, 'Callback tidak ditemukan.', 'NOT_FOUND')
  if (!isSupportedProvider(row.provider)) throw appError(409, 'Gateway ini tidak didukung lagi.', 'CONFLICT')
  const creds = await getGatewayCredentials(row.provider, ctx.db)
  if (!creds) throw appError(409, 'Kredensial gateway belum diisi.', 'CONFLICT')
  const normalized = await normalizeCallback(ctx, getPaymentDriver(row.provider), creds, row.payload as Record<string, unknown>)
  const result = normalized ? await applyPayment(ctx, normalized) : { applied: false, reason: 'unknown order' }
  const ok = result.applied || ('noop' in result && result.noop)
  await ctx.db.update(paymentWebhookEvents).set({
    processedAt: new Date(), replayCount: sql`${paymentWebhookEvents.replayCount} + 1`, ...(ok ? { error: null } : { error: result.reason ?? null })
  }).where(eq(paymentWebhookEvents.id, id))
  await recordAudit(ctx, { audience: 'staff', action: 'payment.webhook_replay', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'payment_webhook_event', targetId: id, metadata: { result } })
  return { ...result, status: normalized?.status ?? null }
}
