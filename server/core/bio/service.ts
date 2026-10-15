import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { BIO_SOCIALS, BIO_THEMES, HANDLE_PATTERN, normalizeHandle, RESERVED_HANDLES, type BioThemeKey } from '../../../shared/utils/bio'
import { recordAudit } from '../audit'
import { assertAbility, type WorkspaceContext } from '../context'
import type { Executor } from '../db/client'
import { getDb } from '../db/client'
import { bioCategories, bioItems, bioPages, links, workspaces } from '../db/schema'
import { assertWithinLimit, can } from '../entitlements'
import { appError } from '../errors'
import { bioUrl, shortLinkFor, shortUrl } from '../links/service'

export const handleSchema = z.string().transform(normalizeHandle).refine(v => HANDLE_PATTERN.test(v), 'Nama Etalase 3–30 karakter: huruf kecil, angka, titik atau garis bawah.')
  .refine(v => !RESERVED_HANDLES.has(v), 'Nama ini tidak bisa dipakai. Coba yang lain.')

async function assertHandleFree(db: Executor, handle: string, exceptId?: string) {
  const [taken] = await db.select({ id: bioPages.id }).from(bioPages)
    .where(and(sql`lower(${bioPages.handle}) = ${normalizeHandle(handle)}`, exceptId ? ne(bioPages.id, exceptId) : undefined)).limit(1)
  if (taken) throw appError(409, 'Nama Etalase ini sudah dipakai. Coba yang lain.', 'CONFLICT', { field: 'handle' })
}

export async function checkHandle(ctx: WorkspaceContext, raw: string) {
  assertAbility(ctx, 'bio.manage')
  const parsed = handleSchema.safeParse(raw)
  if (!parsed.success) return { available: false, reason: parsed.error.issues[0]?.message ?? '' }
  const [taken] = await ctx.db.select({ id: bioPages.id, workspaceId: bioPages.workspaceId }).from(bioPages).where(sql`lower(${bioPages.handle}) = ${parsed.data}`).limit(1)
  return { available: !taken || taken.workspaceId === ctx.workspaceId, reason: taken && taken.workspaceId !== ctx.workspaceId ? 'Nama Etalase ini sudah dipakai.' : '' }
}

async function loadPage(ctx: WorkspaceContext, pageId?: string) {
  const [page] = await ctx.db.select().from(bioPages)
    .where(and(eq(bioPages.workspaceId, ctx.workspaceId), pageId ? eq(bioPages.id, pageId) : undefined))
    .orderBy(asc(bioPages.createdAt)).limit(1)
  return page ?? null
}

async function editorView(ctx: WorkspaceContext, page: typeof bioPages.$inferSelect) {
  const [categories, items] = await Promise.all([
    ctx.db.select().from(bioCategories).where(eq(bioCategories.bioPageId, page.id)).orderBy(asc(bioCategories.position)),
    ctx.db.select({ item: bioItems, link: links }).from(bioItems).leftJoin(links, eq(links.id, bioItems.linkId))
      .where(eq(bioItems.bioPageId, page.id)).orderBy(asc(bioItems.position))
  ])
  return {
    id: page.id, handle: page.handle, title: page.title, bio: page.bio, avatarUrl: page.avatarUrl, published: page.published,
    theme: (page.theme as { preset?: BioThemeKey }).preset ?? 'rose', socials: page.socials, indexable: (page.seo as { indexable?: boolean }).indexable !== false,
    url: bioUrl(page.handle),
    categories: categories.map(c => ({ id: c.id, name: c.name, position: c.position })),
    items: items.map(({ item, link }) => ({
      id: item.id, type: item.type, linkId: item.linkId, categoryId: item.categoryId, pinned: item.pinned, visible: item.visible, position: item.position,
      title: item.title ?? link?.title ?? null, imageUrl: item.imageUrl ?? link?.imageUrl ?? null, priceIdr: link?.priceIdr ?? null, merchant: link?.merchant ?? null, badge: item.badge
    }))
  }
}

export async function getMyBio(ctx: WorkspaceContext) {
  assertAbility(ctx, 'bio.manage')
  const page = await loadPage(ctx)
  return page ? editorView(ctx, page) : null
}

export const createBioSchema = z.object({ handle: handleSchema, title: z.string().trim().min(1).max(80) })

/** Onboarding step 2: pick a handle; a default theme is applied (smart default). */
export async function createBio(ctx: WorkspaceContext, input: z.infer<typeof createBioSchema>) {
  assertAbility(ctx, 'bio.manage')
  if (await loadPage(ctx)) throw appError(409, 'Etalase sudah dibuat.', 'CONFLICT')
  await assertHandleFree(ctx.db, input.handle)
  const [page] = await ctx.db.insert(bioPages).values({ workspaceId: ctx.workspaceId, handle: normalizeHandle(input.handle), title: input.title, theme: { preset: 'rose' } }).returning()
    .catch((error: { code?: string }) => {
      // Two creators racing for the same handle: the unique index decides.
      if (error.code === '23505') throw appError(409, 'Nama Etalase ini sudah dipakai. Coba yang lain.', 'CONFLICT', { field: 'handle' })
      throw error
    })
  // Existing products join the new Etalase straight away ("one paste, three results").
  const existing = await ctx.db.select({ id: links.id }).from(links).where(and(eq(links.workspaceId, ctx.workspaceId), eq(links.archived, false))).orderBy(asc(links.createdAt)).limit(50)
  for (const link of existing) await addProduct(ctx, link.id, page!.id)
  return editorView(ctx, page!)
}

export const updateBioSchema = z.object({
  handle: handleSchema.optional(),
  title: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(300).nullable().optional(),
  avatarUrl: z.url().max(2000).nullable().optional(),
  theme: z.enum(Object.keys(BIO_THEMES) as [BioThemeKey, ...BioThemeKey[]]).optional(),
  socials: z.partialRecord(z.enum(BIO_SOCIALS), z.string().trim().max(200)).optional(),
  indexable: z.boolean().optional()
})

export async function updateBio(ctx: WorkspaceContext, input: z.infer<typeof updateBioSchema>) {
  assertAbility(ctx, 'bio.manage')
  const page = await loadPage(ctx)
  if (!page) throw appError(404, 'Etalase belum dibuat.', 'NOT_FOUND')
  if (input.handle && input.handle !== page.handle.toLowerCase()) await assertHandleFree(ctx.db, input.handle, page.id)
  const socials = input.socials ? Object.fromEntries(Object.entries(input.socials).filter(([, v]) => v)) : undefined
  const [row] = await ctx.db.update(bioPages).set({
    ...(input.handle && { handle: input.handle }),
    ...(input.title !== undefined && { title: input.title }),
    ...(input.bio !== undefined && { bio: input.bio }),
    ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
    ...(input.theme && { theme: { ...(page.theme as object), preset: input.theme } }),
    ...(socials && { socials }),
    ...(input.indexable !== undefined && { seo: { ...(page.seo as object), indexable: input.indexable } }),
    updatedAt: new Date()
  }).where(eq(bioPages.id, page.id)).returning()
  return editorView(ctx, row!)
}

/** Publishing counts against bioPages (unpublished pages are free) — docs/blueprint/06 §5. */
export async function setBioPublished(ctx: WorkspaceContext, published: boolean) {
  assertAbility(ctx, 'bio.manage')
  const page = await loadPage(ctx)
  if (!page) throw appError(404, 'Etalase belum dibuat.', 'NOT_FOUND')
  if (published && !page.published) {
    const [n] = await ctx.db.select({ n: count() }).from(bioPages).where(and(eq(bioPages.workspaceId, ctx.workspaceId), eq(bioPages.published, true)))
    await assertWithinLimit(ctx, 'bioPages', n?.n ?? 0)
  }
  const [row] = await ctx.db.update(bioPages).set({ published, updatedAt: new Date() }).where(eq(bioPages.id, page.id)).returning()
  await recordAudit(ctx, { audience: 'creator', action: published ? 'bio.publish' : 'bio.unpublish', workspaceId: ctx.workspaceId, targetType: 'bio_page', targetId: page.id, metadata: { userId: ctx.userId } })
  return editorView(ctx, row!)
}

async function nextPosition(db: Executor, pageId: string) {
  const [row] = await db.select({ max: sql<number>`coalesce(max(${bioItems.position}), -1)::int` }).from(bioItems).where(eq(bioItems.bioPageId, pageId))
  return (row?.max ?? -1) + 1
}

/** A product card always links through a bio short link, so Etalase clicks are tracked. Idempotent per link. */
export async function addProduct(ctx: WorkspaceContext, linkId: string, pageId?: string) {
  assertAbility(ctx, 'bio.manage')
  const page = await loadPage(ctx, pageId)
  if (!page) return null
  const [link] = await ctx.db.select({ id: links.id }).from(links).where(and(eq(links.id, linkId), eq(links.workspaceId, ctx.workspaceId))).limit(1)
  if (!link) throw appError(404, 'Link tidak ditemukan.', 'NOT_FOUND')
  const [existing] = await ctx.db.select({ id: bioItems.id }).from(bioItems).where(and(eq(bioItems.bioPageId, page.id), eq(bioItems.linkId, linkId))).limit(1)
  if (existing) return existing.id
  const short = await shortLinkFor(ctx.db, ctx.workspaceId, linkId, 'bio')
  const [item] = await ctx.db.insert(bioItems).values({ workspaceId: ctx.workspaceId, bioPageId: page.id, type: 'product', linkId, shortLinkId: short.id, position: await nextPosition(ctx.db, page.id) }).returning({ id: bioItems.id })
  return item!.id
}

export async function removeProduct(ctx: WorkspaceContext, linkId: string) {
  assertAbility(ctx, 'bio.manage')
  await ctx.db.delete(bioItems).where(and(eq(bioItems.workspaceId, ctx.workspaceId), eq(bioItems.linkId, linkId)))
}

export const itemPatchSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  badge: z.string().trim().max(24).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  visible: z.boolean().optional()
})

export async function updateItem(ctx: WorkspaceContext, itemId: string, input: z.infer<typeof itemPatchSchema>) {
  assertAbility(ctx, 'bio.manage')
  if (input.categoryId) {
    const [category] = await ctx.db.select({ id: bioCategories.id }).from(bioCategories).where(and(eq(bioCategories.id, input.categoryId), eq(bioCategories.workspaceId, ctx.workspaceId))).limit(1)
    if (!category) throw appError(404, 'Kategori tidak ditemukan.', 'NOT_FOUND')
  }
  const rows = await ctx.db.update(bioItems).set({ ...input, updatedAt: new Date() }).where(and(eq(bioItems.id, itemId), eq(bioItems.workspaceId, ctx.workspaceId))).returning({ id: bioItems.id })
  if (!rows.length) throw appError(404, 'Produk tidak ditemukan.', 'NOT_FOUND')
  return getMyBio(ctx)
}

export async function reorderItems(ctx: WorkspaceContext, itemIds: string[]) {
  assertAbility(ctx, 'bio.manage')
  await ctx.db.transaction(async (tx) => {
    for (const [position, id] of itemIds.entries()) {
      await tx.update(bioItems).set({ position }).where(and(eq(bioItems.id, id), eq(bioItems.workspaceId, ctx.workspaceId)))
    }
  })
  return getMyBio(ctx)
}

export async function addCategory(ctx: WorkspaceContext, name: string) {
  assertAbility(ctx, 'bio.manage')
  const page = await loadPage(ctx)
  if (!page) throw appError(404, 'Etalase belum dibuat.', 'NOT_FOUND')
  const [row] = await ctx.db.select({ max: sql<number>`coalesce(max(${bioCategories.position}), -1)::int` }).from(bioCategories).where(eq(bioCategories.bioPageId, page.id))
  await ctx.db.insert(bioCategories).values({ workspaceId: ctx.workspaceId, bioPageId: page.id, name, position: (row?.max ?? -1) + 1 })
  return getMyBio(ctx)
}

export async function removeCategory(ctx: WorkspaceContext, categoryId: string) {
  assertAbility(ctx, 'bio.manage')
  await ctx.db.transaction(async (tx) => {
    await tx.update(bioItems).set({ categoryId: null }).where(and(eq(bioItems.workspaceId, ctx.workspaceId), eq(bioItems.categoryId, categoryId)))
    await tx.delete(bioCategories).where(and(eq(bioCategories.id, categoryId), eq(bioCategories.workspaceId, ctx.workspaceId)))
  })
  return getMyBio(ctx)
}

/**
 * The public payload (GET /api/public/bio/:handle). Only published pages of active workspaces render.
 * Plain text only; product buttons are bio short links. Branding unless the plan has removeBranding (degrade).
 */
export async function getPublicBio(handle: string, db: Executor = getDb()) {
  const normalized = normalizeHandle(handle)
  const [row] = await db.select({ page: bioPages, status: workspaces.status, deletedAt: workspaces.deletedAt }).from(bioPages)
    .innerJoin(workspaces, eq(workspaces.id, bioPages.workspaceId))
    .where(sql`lower(${bioPages.handle}) = ${normalized}`).limit(1)
  if (!row) return { state: 'not_found' as const }
  if (!row.page.published || row.status !== 'active' || row.deletedAt) return { state: 'inactive' as const }
  const page = row.page
  const [categories, items] = await Promise.all([
    db.select({ id: bioCategories.id, name: bioCategories.name }).from(bioCategories).where(eq(bioCategories.bioPageId, page.id)).orderBy(asc(bioCategories.position)),
    db.select({ item: bioItems, link: links, slug: sql<string | null>`(select slug from short_links sl where sl.id = ${bioItems.shortLinkId})` }).from(bioItems)
      .leftJoin(links, eq(links.id, bioItems.linkId))
      .where(and(eq(bioItems.bioPageId, page.id), eq(bioItems.visible, true))).orderBy(sql`${bioItems.pinned} desc`, asc(bioItems.position))
  ])
  return {
    state: 'ok' as const,
    handle: page.handle,
    title: page.title ?? page.handle,
    bio: page.bio,
    avatarUrl: page.avatarUrl,
    theme: BIO_THEMES[(page.theme as { preset?: BioThemeKey }).preset ?? 'rose'] ?? BIO_THEMES.rose,
    socials: page.socials,
    indexable: (page.seo as { indexable?: boolean }).indexable !== false,
    branding: !(await can(page.workspaceId, 'removeBranding', db)),
    categories,
    items: items.filter(({ link, item }) => item.type !== 'product' || (link && !link.archived)).map(({ item, link, slug }) => ({
      id: item.id, categoryId: item.categoryId, pinned: item.pinned, badge: item.badge,
      title: item.title ?? link?.title ?? 'Produk', imageUrl: item.imageUrl ?? link?.imageUrl ?? null, priceIdr: link?.priceIdr ?? null, merchant: link?.merchant ?? 'other',
      url: slug ? shortUrl(slug) : null
    })).filter(item => item.url)
  }
}
