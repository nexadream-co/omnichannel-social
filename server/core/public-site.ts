import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { normalizeIndonesianPhone } from '../../shared/utils/phone'
import type { CoreContext } from './context'
import type { Executor } from './db/client'
import { contactMessages, faqs, pages, plans } from './db/schema'
import { sendTemplatedEmail } from './email'
import { appError } from './errors'
import { notifyStaff } from './notifications'
import { consumeRateLimit } from './rate-limit'
import { getAllSettings, getSettingNumber } from './settings'

/** GET /api/public/landing (docs/blueprint/14 §3): nothing on the landing is hard-coded. */
export async function landingPayload(db: Executor) {
  const [planRows, faqRows, s] = await Promise.all([
    db.select().from(plans).where(and(eq(plans.isActive, true), eq(plans.isPublic, true))).orderBy(asc(plans.order)),
    db.select({ id: faqs.id, question: faqs.question, answer: faqs.answer, category: faqs.category }).from(faqs).where(eq(faqs.isActive, true)).orderBy(asc(faqs.order), asc(faqs.createdAt)),
    getAllSettings(db)
  ])
  return {
    plans: planRows.map(p => ({ slug: p.slug, name: p.name, description: p.description, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, trialDays: p.trialDays, limits: p.limits, features: p.features })),
    faqs: faqRows,
    company: { name: s['company.name'], tagline: s['company.tagline'], email: s['company.email'], whatsapp: s['company.whatsapp'], instagram: s['company.instagram'], threads: s['company.threads'], tiktok: s['company.tiktok'], youtube: s['company.youtube'] },
    trialPlanSlug: s['billing.trialPlanSlug'],
    registrationOpen: s['app.registrationOpen'] !== 'false'
  }
}

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  email: z.email('Email tidak valid.'),
  phone: z.string().trim().max(30).optional(),
  subject: z.string().trim().max(150).optional(),
  message: z.string().trim().min(10, 'Pesan minimal 10 karakter.').max(5000),
  website: z.string().max(0).optional() // honeypot: bots fill it, humans never see it
})

/** POST /api/contact: rate-limited per IP, stored, emailed to the company inbox, bell for staff. */
export async function submitContact(ctx: CoreContext, input: z.infer<typeof contactSchema>) {
  if (input.website) return { ok: true } // silently drop bots
  const perHour = Math.max(1, Math.trunc(await getSettingNumber('app.contactRateLimitPerHour', 5, ctx.db)))
  const bucket = await consumeRateLimit(`contact:${ctx.ip ?? 'unknown'}`, perHour, 3_600_000, ctx.db)
  if (!bucket.allowed) throw appError(429, 'Terlalu banyak pesan dari jaringan ini. Coba lagi nanti atau hubungi kami lewat email.', 'RATE_LIMITED')
  const email = input.email.trim().toLowerCase()
  const phone = input.phone ? normalizeIndonesianPhone(input.phone) ?? input.phone : null
  await ctx.db.insert(contactMessages).values({ name: input.name, email, phone, subject: input.subject || null, message: input.message, ip: ctx.ip ?? null })
  const s = await getAllSettings(ctx.db)
  if (s['company.email']) {
    ctx.defer(sendTemplatedEmail(ctx, 'contact_enquiry', s['company.email'], { name: input.name, email, phone: phone ?? '-', subject: input.subject || '-', message: input.message }))
  }
  await notifyStaff(ctx, 'messages.read', { templateKey: 'admin_new_message', variables: { name: input.name, email, subject: input.subject || input.message.slice(0, 80) } })
  return { ok: true }
}

/** Sitemap rows: published pages with their public paths. */
export async function sitemapPages(db: Executor) {
  const rows = await db.select({ slug: pages.slug, updatedAt: pages.updatedAt }).from(pages).where(eq(pages.isPublished, true))
  return rows.map(row => ({ path: row.slug === 'privacy' || row.slug === 'terms' ? `/${row.slug}` : `/page/${row.slug}`, updatedAt: row.updatedAt }))
}
