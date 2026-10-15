import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { wrapEmailHtml } from '../../../shared/utils/email-brand'
import { escapeHtml, renderTemplateString, type TemplateVariable } from '../../../shared/utils/templates'
import { recordAudit } from '../audit'
import { assertPermission, type StaffContext } from '../context'
import { emailTemplates, notificationTemplates } from '../db/schema'
import { env } from '../env'
import { appError } from '../errors'
import { getAllSettings } from '../settings'

export async function listEmailTemplates(ctx: StaffContext) {
  assertPermission(ctx, 'email-templates.read')
  const items = await ctx.db.select().from(emailTemplates).orderBy(asc(emailTemplates.name))
  return { items }
}

export const emailTemplatePatchSchema = z.object({
  subject: z.string().trim().min(1, 'Subjek wajib diisi.').max(200, 'Subjek terlalu panjang.').optional(),
  body: z.string().min(1, 'Isi email wajib diisi.').max(50_000, 'Isi email terlalu panjang.').optional(),
  isActive: z.boolean().optional()
})

export async function updateEmailTemplate(ctx: StaffContext, id: string, input: z.infer<typeof emailTemplatePatchSchema>) {
  assertPermission(ctx, 'email-templates.write')
  const [row] = await ctx.db.update(emailTemplates).set({ ...input, updatedAt: new Date() }).where(eq(emailTemplates.id, id)).returning()
  if (!row) throw appError(404, 'Templat tidak ditemukan.', 'NOT_FOUND')
  await recordAudit(ctx, { audience: 'staff', action: 'template.update', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'email_template', targetId: row.key })
  return row
}

export const emailPreviewSchema = z.object({
  subject: z.string().max(200),
  body: z.string().max(50_000),
  variables: z.array(z.object({ token: z.string(), label: z.string(), sample: z.string() })).default([])
})

/** Renders tokens with their samples inside the brand wrapper (live preview in the editor). */
export async function previewEmailTemplate(ctx: StaffContext, input: z.infer<typeof emailPreviewSchema>) {
  assertPermission(ctx, 'email-templates.read')
  const settings = await getAllSettings(ctx.db)
  const appName = settings['company.name'] || 'Socialz.id'
  const samples: Record<string, string> = { appName, siteUrl: env().siteUrl, supportEmail: settings['company.email'] || '' }
  for (const variable of input.variables as TemplateVariable[]) samples[variable.token] = variable.sample
  const escaped = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, escapeHtml(v)]))
  return {
    subject: renderTemplateString(input.subject, samples),
    html: wrapEmailHtml(renderTemplateString(input.body, escaped), {
      appName, siteUrl: env().siteUrl, supportEmail: samples.supportEmail!, companyName: settings['company.legalName'] || appName,
      logoUrl: settings['company.logoUrl'] || undefined
    })
  }
}

export async function listNotificationTemplates(ctx: StaffContext) {
  assertPermission(ctx, 'notification-templates.read')
  const items = await ctx.db.select().from(notificationTemplates).orderBy(asc(notificationTemplates.name))
  return { items }
}

export const notificationTemplatePatchSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(200).optional(),
  body: z.string().max(2_000).optional(),
  actionLabel: z.string().max(60).nullable().optional(),
  actionUrl: z.string().max(500).nullable().optional(),
  icon: z.string().max(80).nullable().optional(),
  level: z.enum(['info', 'success', 'warning', 'error']).optional(),
  isActive: z.boolean().optional()
})

export async function updateNotificationTemplate(ctx: StaffContext, id: string, input: z.infer<typeof notificationTemplatePatchSchema>) {
  assertPermission(ctx, 'notification-templates.write')
  const [row] = await ctx.db.update(notificationTemplates).set({ ...input, updatedAt: new Date() }).where(eq(notificationTemplates.id, id)).returning()
  if (!row) throw appError(404, 'Templat tidak ditemukan.', 'NOT_FOUND')
  await recordAudit(ctx, { audience: 'staff', action: 'template.update', actorId: ctx.staffUserId, actorName: ctx.staffName, targetType: 'notification_template', targetId: row.key })
  return row
}
