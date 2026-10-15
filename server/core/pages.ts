import { and, eq } from 'drizzle-orm'
import type { Executor } from './db/client'
import { pages } from './db/schema'
import { appError } from './errors'

export async function getPublishedPage(db: Executor, slug: string) {
  const [page] = await db.select({
    slug: pages.slug, title: pages.title, content: pages.content, metaTitle: pages.metaTitle, metaDescription: pages.metaDescription, updatedAt: pages.updatedAt
  }).from(pages).where(and(eq(pages.slug, slug), eq(pages.isPublished, true))).limit(1)
  if (!page) throw appError(404, 'Halaman tidak ditemukan.', 'NOT_FOUND')
  return page
}
