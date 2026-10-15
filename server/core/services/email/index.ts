import { env } from '../../env'
import type { Logger } from '../../log'
import { getSetting } from '../../settings'
import { logDriver } from './log'
import { resendDriver } from './resend'
import type { EmailDriver } from './types'

export type { EmailDriver, OutgoingEmail, SendEmailResult } from './types'

/** Resend when a key is configured; the dev log driver outside production; otherwise null (silent no-op). */
export async function resolveEmailDriver(log: Logger): Promise<EmailDriver | null> {
  const apiKey = await getSetting('email.resendApiKey')
  if (apiKey) return resendDriver(apiKey)
  if (!env().isProduction) return logDriver(log, env().MAILPIT_URL)
  return null
}
