import { and, count, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { assertPermission, type StaffContext } from '../context'
import { appLogs, staffUsers, users, workspaces } from '../db/schema'
import { rangeStart } from './content'

export const appLogsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).default(''),
  /** A creator's email (partial), or an exact user / workspace id. */
  user: z.string().trim().max(200).default(''),
  level: z.enum(['all', 'warn', 'error']).default('all'),
  range: z.enum(['all', 'today', '7d', '30d']).default('7d')
})

/** /admin/system/logs: warn/error lines with who hit them (logs.read, admins only). */
export async function listAppLogs(ctx: StaffContext, query: z.infer<typeof appLogsQuery>) {
  assertPermission(ctx, 'logs.read')
  const from = rangeStart(query.range)
  const like = `%${query.search}%`
  const where = and(
    query.level !== 'all' ? eq(appLogs.level, query.level) : undefined,
    from ? gte(appLogs.createdAt, from) : undefined,
    query.user ? or(eq(appLogs.userId, query.user), eq(appLogs.workspaceId, query.user), ilike(users.email, `%${query.user}%`)) : undefined,
    query.search ? or(ilike(appLogs.msg, like), ilike(appLogs.path, like), ilike(sql`${appLogs.fields}::text`, like)) : undefined
  )
  const base = () => ctx.db.select({ n: count() }).from(appLogs).leftJoin(users, eq(users.id, appLogs.userId))
  const [items, [total]] = await Promise.all([
    ctx.db.select({
      id: appLogs.id, level: appLogs.level, msg: appLogs.msg, path: appLogs.path, requestId: appLogs.requestId, fields: appLogs.fields, createdAt: appLogs.createdAt,
      userId: appLogs.userId, userEmail: users.email, userName: users.name,
      workspaceId: appLogs.workspaceId, workspaceName: workspaces.name,
      staffUserId: appLogs.staffUserId, staffName: staffUsers.name
    }).from(appLogs)
      .leftJoin(users, eq(users.id, appLogs.userId))
      .leftJoin(workspaces, eq(workspaces.id, appLogs.workspaceId))
      .leftJoin(staffUsers, eq(staffUsers.id, appLogs.staffUserId))
      .where(where).orderBy(desc(appLogs.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    base().where(where)
  ])
  const n = total?.n ?? 0
  return { items, meta: { page: query.page, limit: query.limit, total: n, pageCount: Math.max(1, Math.ceil(n / query.limit)) } }
}
