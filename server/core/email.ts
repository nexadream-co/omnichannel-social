import { eq } from 'drizzle-orm'
import { htmlToText, wrapEmailHtml } from '../../shared/utils/email-brand'
import { EMAIL_TEMPLATES, escapeHtml, renderTemplateString } from '../../shared/utils/templates'
import type { CoreContext } from './context'
import { emailTemplates } from './db/schema'
import { env } from './env'
import { resolveEmailDriver, type SendEmailResult } from './services/email'
import { getAllSettings } from './settings'

type Ctx = Pick<CoreContext, 'db' | 'log'>

async function commonVariables() {
  const settings = await getAllSettings()
  const whatsapp = settings['company.whatsapp']
  return {
    appName: settings['company.name'] || 'Socialz.id',
    siteUrl: env().siteUrl,
    supportEmail: settings['company.email'] || '',
    whatsappUrl: whatsapp ? `https://wa.me/${whatsapp}` : '',
    settings
  }
}

/**
 * DB row if active → that row; DB row inactive → null (staff switched it off); no row → code catalog.
 * Variables are HTML-escaped before rendering into the body.
 */
export async function renderEmailTemplate(ctx: Ctx, key: string, variables: Record<string, unknown>): Promise<{ subject: string, html: string } | null> {
  const [row] = await ctx.db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1)
  if (row && !row.isActive) return null
  const def = row ?? EMAIL_TEMPLATES.find(template => template.key === key)
  if (!def) throw new Error(`Unknown email template: ${key}`)
  const common = await commonVariables()
  const all = { appName: common.appName, siteUrl: common.siteUrl, supportEmail: common.supportEmail, whatsappUrl: common.whatsappUrl, ...variables }
  const escaped = Object.fromEntries(Object.entries(all).map(([name, value]) => [name, value === null || value === undefined ? '' : escapeHtml(String(value))]))
  const subject = renderTemplateString(def.subject, all)
  const inner = renderTemplateString(def.body, escaped)
  const html = wrapEmailHtml(inner, {
    appName: common.appName,
    siteUrl: common.siteUrl,
    supportEmail: common.supportEmail,
    companyName: common.settings['company.legalName'] || common.appName,
    logoUrl: common.settings['company.logoUrl'] || undefined,
    whatsappUrl: common.whatsappUrl || undefined
  })
  return { subject, html }
}

/** Never throws: failures are logged and returned (docs/blueprint/11 §4). */
export async function sendEmail(ctx: Ctx, input: { to: string, subject: string, html: string, text?: string, replyTo?: string }): Promise<SendEmailResult> {
  try {
    const driver = await resolveEmailDriver(ctx.log)
    if (!driver) return { sent: false, skipped: 'not-configured' }
    const settings = await getAllSettings()
    const result = await driver.send({
      from: `"${settings['email.fromName'] || 'Socialz.id'}" <${settings['email.fromEmail'] || 'halo@socialz.id'}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      replyTo: input.replyTo || settings['email.replyTo'] || settings['company.email'] || undefined
    })
    if (!result.sent) ctx.log.warn('email.send_failed', { driver: driver.name, subject: input.subject, error: result.error })
    return result
  } catch (error) {
    ctx.log.error('email.send_error', { error })
    return { sent: false, error: (error as Error).message }
  }
}

export async function sendTemplatedEmail(ctx: Ctx, key: string, to: string, variables: Record<string, unknown>): Promise<SendEmailResult> {
  try {
    const rendered = await renderEmailTemplate(ctx, key, variables)
    if (!rendered) return { sent: false, skipped: 'template-inactive' }
    return await sendEmail(ctx, { to, subject: rendered.subject, html: rendered.html })
  } catch (error) {
    ctx.log.error('email.template_error', { key, error })
    return { sent: false, error: (error as Error).message }
  }
}

/** True when a real driver would send (Resend key set, or the dev log driver outside production). */
export async function isEmailConfigured(): Promise<boolean> {
  return Boolean(await getAllSettings().then(s => s['email.resendApiKey'])) || !env().isProduction
}
