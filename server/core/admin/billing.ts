import { and, count, desc, eq, ilike, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import { PAYMENT_PROVIDERS, PAYMENT_STATUSES } from '../../../shared/utils/payments'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import { decrypt, encrypt, maskSecret } from '../crypto'
import { paymentGateways, payments, plans, subscriptions, workspaces } from '../db/schema'
import { appError } from '../errors'
import { gatewaySecretAad } from '../services/payments'

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default('')
})
const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })

/** docs/blueprint/08 §9. Secrets come back masked only. */
export async function listGateways(ctx: StaffContext) {
  assertPermission(ctx, 'payments.read')
  const rows = await ctx.db.select().from(paymentGateways).orderBy(paymentGateways.provider)
  return {
    providers: PAYMENT_PROVIDERS,
    items: rows.map(row => ({
      id: row.id, provider: row.provider, label: row.label, isActive: row.isActive, isSandbox: row.isSandbox, merchantId: row.merchantId,
      baseUrl: row.baseUrl, orderPrefix: row.orderPrefix, updatedAt: row.updatedAt,
      serverKeyMasked: row.serverKey ? maskSecret(decrypt(row.serverKey, gatewaySecretAad(row.provider, 'serverKey'))) : null,
      clientKeyMasked: row.clientKey ? maskSecret(decrypt(row.clientKey, gatewaySecretAad(row.provider, 'clientKey'))) : null,
      hasServerKey: Boolean(row.serverKey), hasClientKey: Boolean(row.clientKey)
    }))
  }
}

export const gatewayPatchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  isSandbox: z.boolean().optional(),
  merchantId: z.string().trim().nullable().optional(),
  baseUrl: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).nullable().optional(),
  orderPrefix: z.union([z.string().regex(/^[A-Za-z0-9_-]+$/, 'Prefiks hanya huruf, angka, - dan _.'), z.literal('')]).nullable().optional(),
  serverKey: z.string().optional(),
  clientKey: z.string().optional()
})

export async function updateGateway(ctx: StaffContext, id: string, input: z.infer<typeof gatewayPatchSchema>) {
  assertPermission(ctx, 'payments.write')
  const [row] = await ctx.db.select().from(paymentGateways).where(eq(paymentGateways.id, id)).limit(1)
  if (!row) throw appError(404, 'Gateway tidak ditemukan.', 'NOT_FOUND')
  const provider = PAYMENT_PROVIDERS.find(p => p.value === row.provider)
  const blank = (v: string | null | undefined) => (v === '' ? null : v)
  const next = {
    label: input.label ?? row.label,
    isSandbox: provider?.supportsSandbox === false ? false : input.isSandbox ?? row.isSandbox,
    merchantId: input.merchantId !== undefined ? blank(input.merchantId) : row.merchantId,
    baseUrl: input.baseUrl !== undefined ? blank(input.baseUrl)?.replace(/\/+$/, '') ?? null : row.baseUrl,
    orderPrefix: input.orderPrefix !== undefined ? blank(input.orderPrefix) : row.orderPrefix,
    serverKey: input.serverKey ? encrypt(input.serverKey.trim(), gatewaySecretAad(row.provider, 'serverKey')) : row.serverKey,
    clientKey: input.clientKey ? encrypt(input.clientKey.trim(), gatewaySecretAad(row.provider, 'clientKey')) : row.clientKey
  }
  const activating = input.isActive === true && !row.isActive
  if (activating) {
    if (!provider?.isImplemented) throw appError(409, 'Gateway ini belum bisa diaktifkan.', 'CONFLICT')
    const missing = provider.fields.filter(field => !next[field.key]).map(field => field.label)
    if (missing.length) throw appError(409, `Lengkapi ${missing.join(', ')} terlebih dahulu.`, 'CONFLICT')
  }
  await ctx.db.transaction(async (tx) => {
    if (activating) await tx.update(paymentGateways).set({ isActive: false, updatedAt: new Date() }).where(ne(paymentGateways.id, id))
    await tx.update(paymentGateways).set({ ...next, isActive: input.isActive ?? row.isActive, updatedAt: new Date() }).where(eq(paymentGateways.id, id))
  })
  await recordAudit(ctx, {
    audience: 'staff', action: 'payment_gateway.update', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'payment_gateway', targetId: id,
    metadata: { fields: Object.keys(input).filter(k => k !== 'serverKey' && k !== 'clientKey'), secretsChanged: Boolean(input.serverKey || input.clientKey), isActive: input.isActive }
  })
  return listGateways(ctx)
}

export const adminPaymentsQuery = listQuery.extend({ status: z.enum(['all', ...PAYMENT_STATUSES]).default('all') })

export async function listAdminPayments(ctx: StaffContext, query: z.infer<typeof adminPaymentsQuery>) {
  assertPermission(ctx, 'payments.read')
  const where = and(
    query.status !== 'all' ? eq(payments.status, query.status) : undefined,
    query.search ? or(ilike(payments.orderId, `%${query.search}%`), ilike(payments.gatewayOrderId, `%${query.search}%`), ilike(workspaces.name, `%${query.search}%`)) : undefined
  )
  const [items, [total]] = await Promise.all([
    ctx.db.select({
      id: payments.id, orderId: payments.orderId, gatewayOrderId: payments.gatewayOrderId, provider: payments.provider, amount: payments.amount, status: payments.status,
      rawStatus: payments.rawStatus, paymentType: payments.paymentType, planSlug: payments.planSlug, period: payments.period, paidAt: payments.paidAt, createdAt: payments.createdAt,
      workspaceId: payments.workspaceId, workspaceName: workspaces.name
    }).from(payments).innerJoin(workspaces, eq(workspaces.id, payments.workspaceId)).where(where).orderBy(desc(payments.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(payments).innerJoin(workspaces, eq(workspaces.id, payments.workspaceId)).where(where)
  ])
  return { items, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

export const adminSubscriptionsQuery = listQuery.extend({
  status: z.enum(['all', 'trialing', 'active', 'past_due', 'cancelled', 'downgraded', 'suspended']).default('all'),
  plan: z.string().default('all')
})

export async function listAdminSubscriptions(ctx: StaffContext, query: z.infer<typeof adminSubscriptionsQuery>) {
  assertPermission(ctx, 'subscriptions.read')
  const where = and(
    query.status !== 'all' ? eq(subscriptions.status, query.status) : undefined,
    query.plan !== 'all' ? eq(plans.slug, query.plan) : undefined,
    query.search ? ilike(workspaces.name, `%${query.search}%`) : undefined
  )
  const base = () => ctx.db.select({
    id: subscriptions.id, workspaceId: subscriptions.workspaceId, workspaceName: workspaces.name, status: subscriptions.status, period: subscriptions.period,
    planSlug: plans.slug, planName: plans.name, trialEndsAt: subscriptions.trialEndsAt, currentPeriodEnd: subscriptions.currentPeriodEnd,
    graceEndsAt: subscriptions.graceEndsAt, cancelledAt: subscriptions.cancelledAt, updatedAt: subscriptions.updatedAt
  }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
  const [items, [total], planRows] = await Promise.all([
    base().where(where).orderBy(desc(subscriptions.updatedAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId)).where(where),
    ctx.db.select({ slug: plans.slug, name: plans.name }).from(plans).orderBy(plans.order)
  ])
  return { items, plans: planRows, meta: meta(query.page, query.limit, total?.n ?? 0) }
}
