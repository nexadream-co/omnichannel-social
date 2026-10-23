import { and, asc, count, desc, eq, gte, ilike, or } from 'drizzle-orm'
import { z } from 'zod'
import { MOMENT_KINDS } from '../../../shared/utils/planner'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import { shoppingMoments } from '../db/schema'
import { appError } from '../errors'
import { isDateKey, todayKey } from '../timezone'

/** /admin/moments: staff keep the shopping calendar right (Ramadan and Lebaran move every year). */

const dayKey = z.string().refine(isDateKey, 'Tanggal tidak valid.')
const fields = {
  name: z.string().trim().min(2, 'Tulis nama momen.').max(60, 'Nama maksimal 60 huruf.'),
  nameEn: z.string().trim().max(60, 'Nama maksimal 60 huruf.').nullable(),
  kind: z.enum(MOMENT_KINDS),
  startsOn: dayKey,
  endsOn: dayKey,
  prepDays: z.number().int().min(1, 'Minimal 1 hari persiapan.').max(30, 'Maksimal 30 hari persiapan.'),
  isActive: z.boolean()
}
const endsAfterStart = (value: { startsOn?: string, endsOn?: string }) => !value.startsOn || !value.endsOn || value.endsOn >= value.startsOn
const endsMessage = { message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.', path: ['endsOn'] }

export const momentSchema = z.object({ ...fields, nameEn: fields.nameEn.optional().default(null), prepDays: fields.prepDays.default(3), isActive: fields.isActive.default(true) })
  .refine(endsAfterStart, endsMessage)
export const momentPatchSchema = z.object(fields).partial().refine(endsAfterStart, endsMessage)

export const momentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(60).default(''),
  when: z.enum(['upcoming', 'all']).default('upcoming')
})

const audit = (ctx: StaffContext, action: string, id: string, metadata?: Record<string, unknown>) =>
  recordAudit(ctx, { audience: 'staff', action, actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, targetType: 'shopping_moment', targetId: id, metadata })

export async function listMoments(ctx: StaffContext, query: z.infer<typeof momentQuerySchema>) {
  assertPermission(ctx, 'moments.read')
  const where = and(
    query.when === 'upcoming' ? gte(shoppingMoments.endsOn, todayKey()) : undefined,
    query.search ? or(ilike(shoppingMoments.name, `%${query.search}%`), ilike(shoppingMoments.nameEn, `%${query.search}%`)) : undefined
  )
  const [items, [total]] = await Promise.all([
    ctx.db.select().from(shoppingMoments).where(where)
      .orderBy(query.when === 'upcoming' ? asc(shoppingMoments.startsOn) : desc(shoppingMoments.startsOn), asc(shoppingMoments.name))
      .limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(shoppingMoments).where(where)
  ])
  const n = total?.n ?? 0
  return { items, meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) } }
}

export async function createMoment(ctx: StaffContext, input: z.infer<typeof momentSchema>) {
  assertPermission(ctx, 'moments.write')
  const [row] = await ctx.db.insert(shoppingMoments).values(input).returning({ id: shoppingMoments.id })
  await audit(ctx, 'moment.create', row!.id, { name: input.name, startsOn: input.startsOn })
  return row!
}

/** No delete: creators' ideas point at moments, so a wrong one is switched off (`isActive`). */
export async function updateMoment(ctx: StaffContext, id: string, input: z.infer<typeof momentPatchSchema>) {
  assertPermission(ctx, 'moments.write')
  const [current] = await ctx.db.select().from(shoppingMoments).where(eq(shoppingMoments.id, id)).limit(1)
  if (!current) throw appError(404, 'Momen tidak ditemukan.', 'NOT_FOUND')
  // A partial update may move only one end of the range: check it against the stored other end.
  if (!endsAfterStart({ startsOn: input.startsOn ?? current.startsOn, endsOn: input.endsOn ?? current.endsOn })) {
    throw appError(400, endsMessage.message, 'VALIDATION_FAILED', { field: 'endsOn' })
  }
  await ctx.db.update(shoppingMoments).set({ ...input, updatedAt: new Date() }).where(eq(shoppingMoments.id, id))
  await audit(ctx, 'moment.update', id, { fields: Object.keys(input) })
}
