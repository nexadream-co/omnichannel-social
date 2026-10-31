import { env, type Env } from '../../env'
import type { Logger } from '../../log'
import { getAllSettings } from '../../settings'
import { logDriver } from './log'
import { resendDriver } from './resend'
import { smtpDriver, type SmtpConfig } from './smtp'
import type { EmailDriver } from './types'

export type { EmailDriver, OutgoingEmail, SendEmailResult } from './types'

/**
 * SMTP server from the back-office settings when its host is filled in, otherwise from SMTP_* env vars.
 * Taken as a whole from one source, so a host from one place never pairs with a password from the other.
 */
export function smtpConfigFrom(settings: Record<string, string | undefined>, source: Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD'>): SmtpConfig | null {
  const fromSettings = Boolean(settings['email.smtpHost']?.trim())
  const host = (fromSettings ? settings['email.smtpHost'] : source.SMTP_HOST)?.trim()
  if (!host) return null
  const port = Number(fromSettings ? settings['email.smtpPort'] : source.SMTP_PORT) || 587
  return {
    host,
    port,
    user: (fromSettings ? settings['email.smtpUser'] : source.SMTP_USER) ?? '',
    password: (fromSettings ? settings['email.smtpPassword'] : source.SMTP_PASSWORD) ?? '',
    secure: port === 465
  }
}

/** Resend when a key is configured; else SMTP when a host is configured; the dev log driver outside production; otherwise null (silent no-op). */
export async function resolveEmailDriver(log: Logger): Promise<EmailDriver | null> {
  const settings = await getAllSettings()
  const apiKey = settings['email.resendApiKey']
  if (apiKey) return resendDriver(apiKey)
  const smtp = smtpConfigFrom(settings, env())
  if (smtp) return smtpDriver(smtp)
  if (!env().isProduction) return logDriver(log, env().MAILPIT_URL)
  return null
}

/** True when a real driver would send (Resend key or SMTP host set, or the dev log driver outside production). */
export async function isEmailDriverConfigured(): Promise<boolean> {
  const settings = await getAllSettings()
  return Boolean(settings['email.resendApiKey']) || Boolean(smtpConfigFrom(settings, env())) || !env().isProduction
}
