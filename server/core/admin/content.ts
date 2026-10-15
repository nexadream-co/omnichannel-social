import { and, asc, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import { auditLogs, contactMessages, faqs, pages, workspaces } from '../db/schema'
import { appError } from '../errors'

const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default('')
})
const audit = (ctx: StaffContext, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) =>
  recordAudit(ctx, { audience: 'staff', action, actorId: ctx.staffUserId, actorName: ctx.staffName, impersonatorId: ctx.impersonatorId, targetType, targetId, metadata })

/** Rich text from the editor, sanitized on save: no scripts, styles or event handlers ever reach the public site. */
export function sanitizePageHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener nofollow' }) }
  })
}

// Meta App Review needs these live at all times.
const ALWAYS_PUBLISHED = new Set(['privacy', 'terms'])

export async function listPages(ctx: StaffContext) {
  assertPermission(ctx, 'pages.read')
  return { items: await ctx.db.select({ id: pages.id, slug: pages.slug, title: pages.title, isPublished: pages.isPublished, updatedAt: pages.updatedAt }).from(pages).orderBy(asc(pages.slug)) }
}

export async function getPageForEdit(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'pages.read')
  const [page] = await ctx.db.select().from(pages).where(eq(pages.id, id)).limit(1)
  if (!page) throw appError(404, 'Halaman tidak ditemukan.', 'NOT_FOUND')
  return { ...page, locked: ALWAYS_PUBLISHED.has(page.slug) }
}

export const pageSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'Slug: huruf kecil, angka dan tanda hubung.'),
  title: z.string().trim().min(2).max(150),
  content: z.string().max(200_000),
  excerpt: z.string().trim().max(300).nullable().optional(),
  metaTitle: z.string().trim().max(70).nullable().optional(),
  metaDescription: z.string().trim().max(170).nullable().optional(),
  isPublished: z.boolean().default(true)
})

export async function createPage(ctx: StaffContext, input: z.infer<typeof pageSchema>) {
  assertPermission(ctx, 'pages.write')
  const [exists] = await ctx.db.select({ id: pages.id }).from(pages).where(eq(pages.slug, input.slug)).limit(1)
  if (exists) throw appError(409, 'Slug halaman ini sudah dipakai.', 'CONFLICT', { field: 'slug' })
  const [row] = await ctx.db.insert(pages).values({ ...input, content: sanitizePageHtml(input.content) }).returning({ id: pages.id })
  await audit(ctx, 'page.update', 'page', row!.id, { slug: input.slug, created: true })
  return row!
}

export async function updatePage(ctx: StaffContext, id: string, input: Partial<z.infer<typeof pageSchema>>) {
  assertPermission(ctx, 'pages.write')
  const page = await getPageForEdit(ctx, id)
  if (page.locked && (input.isPublished === false || (input.slug && input.slug !== page.slug))) {
    throw appError(409, 'Halaman privasi dan syarat wajib selalu terbit untuk review Meta.', 'CONFLICT')
  }
  if (input.slug && input.slug !== page.slug) {
    const [exists] = await ctx.db.select({ id: pages.id }).from(pages).where(eq(pages.slug, input.slug)).limit(1)
    if (exists) throw appError(409, 'Slug halaman ini sudah dipakai.', 'CONFLICT', { field: 'slug' })
  }
  await ctx.db.update(pages).set({ ...input, ...(input.content !== undefined && { content: sanitizePageHtml(input.content) }), updatedAt: new Date() }).where(eq(pages.id, id))
  await audit(ctx, 'page.update', 'page', id, { slug: input.slug ?? page.slug })
}

export async function deletePage(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'pages.write')
  const page = await getPageForEdit(ctx, id)
  if (page.locked) throw appError(409, 'Halaman privasi dan syarat tidak bisa dihapus.', 'CONFLICT')
  await ctx.db.delete(pages).where(eq(pages.id, id))
  await audit(ctx, 'page.delete', 'page', id, { slug: page.slug })
}

// ---------------------------------------------------------------- FAQ

export async function listFaqs(ctx: StaffContext) {
  assertPermission(ctx, 'faq.read')
  return { items: await ctx.db.select().from(faqs).orderBy(asc(faqs.order), asc(faqs.createdAt)) }
}

export const faqSchema = z.object({
  question: z.string().trim().min(5).max(200),
  answer: z.string().trim().min(5).max(2000),
  category: z.string().trim().min(2).max(40).default('umum'),
  order: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true)
})

export async function createFaq(ctx: StaffContext, input: z.infer<typeof faqSchema>) {
  assertPermission(ctx, 'faq.write')
  const [row] = await ctx.db.insert(faqs).values(input).returning({ id: faqs.id })
  await audit(ctx, 'faq.update', 'faq', row!.id, { created: true })
}

export async function updateFaq(ctx: StaffContext, id: string, input: Partial<z.infer<typeof faqSchema>>) {
  assertPermission(ctx, 'faq.write')
  const rows = await ctx.db.update(faqs).set({ ...input, updatedAt: new Date() }).where(eq(faqs.id, id)).returning({ id: faqs.id })
  if (!rows.length) throw appError(404, 'FAQ tidak ditemukan.', 'NOT_FOUND')
  await audit(ctx, 'faq.update', 'faq', id)
}

export async function deleteFaq(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'faq.write')
  await ctx.db.delete(faqs).where(eq(faqs.id, id))
  await audit(ctx, 'faq.delete', 'faq', id)
}

// ---------------------------------------------------------------- contact messages

export const messagesQuery = listQuery.extend({ status: z.enum(['all', 'new', 'read', 'replied', 'archived']).default('all') })

export async function listMessages(ctx: StaffContext, query: z.infer<typeof messagesQuery>) {
  assertPermission(ctx, 'messages.read')
  const like = `%${query.search}%`
  const where = and(
    query.status !== 'all' ? eq(contactMessages.status, query.status) : undefined,
    query.search ? or(ilike(contactMessages.name, like), ilike(contactMessages.email, like), ilike(contactMessages.subject, like), ilike(contactMessages.message, like)) : undefined
  )
  const [items, [total], [unread]] = await Promise.all([
    ctx.db.select().from(contactMessages).where(where).orderBy(desc(contactMessages.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(contactMessages).where(where),
    ctx.db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'new'))
  ])
  return { items, unread: unread?.n ?? 0, meta: meta(query.page, query.limit, total?.n ?? 0) }
}

/** new → read → replied → archived; handledAt is set on the first non-new status and cleared on "new". */
export async function updateMessageStatus(ctx: StaffContext, id: string, status: 'new' | 'read' | 'replied' | 'archived') {
  assertPermission(ctx, 'messages.write')
  const [row] = await ctx.db.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1)
  if (!row) throw appError(404, 'Pesan tidak ditemukan.', 'NOT_FOUND')
  await ctx.db.update(contactMessages).set({ status, handledAt: status === 'new' ? null : row.handledAt ?? new Date(), updatedAt: new Date() }).where(eq(contactMessages.id, id))
  await audit(ctx, 'message.update', 'contact_message', id, { status })
}

export async function deleteMessage(ctx: StaffContext, id: string) {
  assertPermission(ctx, 'messages.write')
  await ctx.db.delete(contactMessages).where(eq(contactMessages.id, id))
  await audit(ctx, 'message.delete', 'contact_message', id)
}

// ---------------------------------------------------------------- audit logs

export const auditQuery = listQuery.extend({
  action: z.string().max(60).default(''),
  audience: z.enum(['all', 'creator', 'staff']).default('all'),
  range: z.enum(['all', 'today', '7d', '30d']).default('7d')
})

/** Range presets resolve on the platform clock (Asia/Jakarta). */
function rangeStart(range: string): Date | null {
  if (range === 'all') return null
  const todayWib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const midnight = new Date(`${todayWib}T00:00:00+07:00`)
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29
  return new Date(midnight.getTime() - days * 86_400_000)
}

export async function listAuditLogs(ctx: StaffContext, query: z.infer<typeof auditQuery>) {
  assertPermission(ctx, 'settings.read')
  const like = `%${query.search}%`
  const from = rangeStart(query.range)
  const where = and(
    query.action ? eq(auditLogs.action, query.action) : undefined,
    query.audience !== 'all' ? eq(auditLogs.audience, query.audience) : undefined,
    from ? gte(auditLogs.createdAt, from) : undefined,
    lte(auditLogs.createdAt, new Date()),
    query.search ? or(ilike(auditLogs.actorName, like), ilike(auditLogs.action, like), ilike(auditLogs.targetId, like), ilike(workspaces.name, like)) : undefined
  )
  const [items, [total]] = await Promise.all([
    ctx.db.select({
      id: auditLogs.id, audience: auditLogs.audience, actorId: auditLogs.actorId, actorName: auditLogs.actorName, impersonatorId: auditLogs.impersonatorId, workspaceId: auditLogs.workspaceId,
      workspaceName: workspaces.name, action: auditLogs.action, targetType: auditLogs.targetType, targetId: auditLogs.targetId, metadata: auditLogs.metadata, ip: auditLogs.ip, userAgent: auditLogs.userAgent, createdAt: auditLogs.createdAt
    }).from(auditLogs).leftJoin(workspaces, eq(workspaces.id, auditLogs.workspaceId)).where(where).orderBy(desc(auditLogs.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
    ctx.db.select({ n: count() }).from(auditLogs).leftJoin(workspaces, eq(workspaces.id, auditLogs.workspaceId)).where(where)
  ])
  return { items, meta: meta(query.page, query.limit, total?.n ?? 0) }
}
