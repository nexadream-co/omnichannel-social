import { asc, count, eq, ne, and } from 'drizzle-orm'
import { z } from 'zod'
import { FEATURE_KEYS, LIMIT_KEYS, normalizeFeatures, normalizeLimits } from '../../../shared/utils/plans'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import { plans, subscriptions } from '../db/schema'
import { invalidateEntitlements } from '../entitlements'
import { appError } from '../errors'
import { getSetting } from '../settings'

const planBase = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'Slug hanya huruf kecil, angka dan tanda minus.').max(40),
  name: z.string().trim().min(1, 'Nama paket wajib diisi.').max(60),
  description: z.string().trim().max(300).optional().nullable(),
  priceMonthly: z.number().min(0, 'Harga tidak boleh negatif.'),
  priceYearly: z.number().min(0, 'Harga tidak boleh negatif.'),
  trialDays: z.number().int().min(0).max(90),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  order: z.number().int(),
  limits: z.partialRecord(z.enum(LIMIT_KEYS), z.number().int().min(-1)),
  features: z.partialRecord(z.enum(FEATURE_KEYS), z.boolean())
})

export const planSchema = planBase.extend({ isActive: z.boolean().default(true), isPublic: z.boolean().default(true), order: z.number().int().default(0) })
/** No defaults on PATCH: an omitted field must never be reset (e.g. silently re-activating a plan). */
export const planPatchSchema = planBase.partial()

function toView(row: typeof plans.$inferSelect, subscriberCount = 0, defaultSlug = '') {
  // The UI only offers delete when the server would allow it.
  const deletable = subscriberCount === 0 && row.slug !== defaultSlug
  return { ...row, limits: normalizeLimits(row.limits), features: normalizeFeatures(row.features), subscriberCount, deletable }
}

export async function listPlans(ctx: StaffContext) {
  assertPermission(ctx, 'plans.read')
  const rows = await ctx.db.select().from(plans).orderBy(asc(plans.order))
  const counts = await ctx.db.select({ planId: subscriptions.planId, n: count() }).from(subscriptions).groupBy(subscriptions.planId)
  const byPlan = new Map(counts.map(c => [c.planId, c.n]))
  const defaultSlug = await getSetting('billing.defaultPlanSlug')
  return { items: rows.map(row => toView(row, byPlan.get(row.id) ?? 0, defaultSlug)) }
}

async function assertSlugFree(ctx: StaffContext, slug: string, exceptId?: string) {
  const [clash] = await ctx.db.select({ id: plans.id }).from(plans).where(exceptId ? and(eq(plans.slug, slug), ne(plans.id, exceptId)) : eq(plans.slug, slug)).limit(1)
  if (clash) throw appError(409, 'Slug paket sudah dipakai.', 'CONFLICT', { field: 'slug' })
}

export async function createPlan(ctx: StaffContext, input: z.infer<typeof planSchema>) {
  assertPermission(ctx, 'plans.write')
  await assertSlugFree(ctx, input.slug)
  const [row] = await ctx.db.insert(plans).values({
    ...input, id: `plan-${input.slug}`, description: input.description ?? null,
    limits: normalizeLimits(input.limits), features: normalizeFeatures(input.features)
  }).returning()
  await recordAudit(ctx, { audience: 'staff', action: 'plan.create', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'plan', targetId: row!.id })
  return toView(row!)
}

export async function updatePlan(ctx: StaffContext, id: string, input: z.infer<typeof planPatchSchema>) {
  assertPermission(ctx, 'plans.write')
  const [current] = await ctx.db.select().from(plans).where(eq(plans.id, id)).limit(1)
  if (!current) throw appError(404, 'Paket tidak ditemukan.', 'NOT_FOUND')
  if (input.slug && input.slug !== current.slug) {
    if (current.slug === await getSetting('billing.defaultPlanSlug')) throw appError(409, 'Slug paket default tidak bisa diubah.', 'CONFLICT', { field: 'slug' })
    await assertSlugFree(ctx, input.slug, id)
  }
  const [row] = await ctx.db.update(plans).set({
    ...input,
    ...(input.limits && { limits: normalizeLimits({ ...normalizeLimits(current.limits), ...input.limits }) }),
    ...(input.features && { features: normalizeFeatures({ ...normalizeFeatures(current.features), ...input.features }) }),
    updatedAt: new Date()
  }).where(eq(plans.id, id)).returning()
  // Every workspace on any plan may be affected (the default plan backs every lapsed subscription).
  await invalidateEntitlements(undefined, ctx.db)
  await recordAudit(ctx, { audience: 'staff', action: 'plan.update', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'plan', targetId: id, metadata: { fields: Object.keys(input) } })
  return toView(row!)
}

export async function deletePlan(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'plans.write')
  const [current] = await ctx.db.select().from(plans).where(eq(plans.id, id)).limit(1)
  if (!current) throw appError(404, 'Paket tidak ditemukan.', 'NOT_FOUND')
  if (current.slug === await getSetting('billing.defaultPlanSlug')) throw appError(409, 'Paket default tidak bisa dihapus.', 'CONFLICT')
  const [used] = await ctx.db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.planId, id))
  if ((used?.n ?? 0) > 0) throw appError(409, 'Paket ini masih dipakai. Nonaktifkan saja paket ini.', 'CONFLICT')
  await ctx.db.delete(plans).where(eq(plans.id, id))
  await recordAudit(ctx, { audience: 'staff', action: 'plan.delete', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'plan', targetId: id })
  return { success: true }
}
