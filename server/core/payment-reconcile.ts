import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import type { CoreContext } from './context'
import { payments } from './db/schema'
import { applyPayment } from './payment-apply'
import { getActiveGateway } from './services/payments'

/**
 * Safety net for missed callbacks (docs/blueprint/08 §8): re-read every payment still pending from the last
 * 48 hours (max 200, oldest first) from the active gateway. One failure is logged and skipped.
 */
export async function reconcilePendingPayments(ctx: Pick<CoreContext, 'db' | 'log' | 'defer'>): Promise<{ checked: number, updated: number }> {
  const gateway = await getActiveGateway(ctx.db)
  if (!gateway) return { checked: 0, updated: 0 }
  const rows = await ctx.db.select({ orderId: payments.orderId }).from(payments).where(and(
    inArray(payments.status, ['pending', 'challenge']), eq(payments.provider, gateway.driver.provider), gt(payments.createdAt, new Date(Date.now() - 48 * 3_600_000))
  )).orderBy(asc(payments.createdAt)).limit(200)
  let updated = 0
  for (const row of rows) {
    try {
      const result = await applyPayment(ctx, await gateway.driver.getStatus(gateway.creds, row.orderId))
      if (result.applied) updated++
    } catch (error) {
      ctx.log.warn('payments.reconcile_failed', { orderId: row.orderId, error })
    }
  }
  return { checked: rows.length, updated }
}
