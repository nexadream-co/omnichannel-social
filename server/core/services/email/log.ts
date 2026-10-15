import type { Logger } from '../../log'
import type { EmailDriver, OutgoingEmail, SendEmailResult } from './types'

function parseAddress(value: string): { Email: string, Name?: string } {
  const match = /^"?([^"<]*)"?\s*<([^>]+)>$/.exec(value.trim())
  return match ? { Name: match[1]!.trim(), Email: match[2]!.trim() } : { Email: value.trim() }
}

/**
 * Development driver: logs the email and, when MAILPIT_URL is set, delivers it to Mailpit's HTTP send API,
 * so auth flows can be tested without a Resend key.
 */
export function logDriver(log: Logger, mailpitUrl: string, fetchImpl: typeof fetch = fetch): EmailDriver {
  return {
    name: 'log',
    async send(message: OutgoingEmail): Promise<SendEmailResult> {
      log.info('email.dev', { to: message.to, subject: message.subject, text: message.text.slice(0, 2000) })
      if (!mailpitUrl) return { sent: true, id: 'logged' }
      try {
        const response = await fetchImpl(`${mailpitUrl.replace(/\/+$/, '')}/api/v1/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            From: parseAddress(message.from),
            To: [parseAddress(message.to)],
            ReplyTo: message.replyTo ? [parseAddress(message.replyTo)] : undefined,
            Subject: message.subject,
            HTML: message.html,
            Text: message.text
          }),
          signal: AbortSignal.timeout(5_000)
        })
        if (!response.ok) return { sent: false, error: `Mailpit HTTP ${response.status}` }
        const body = await response.json().catch(() => ({})) as { ID?: string }
        return { sent: true, id: body.ID }
      } catch (error) {
        return { sent: false, error: (error as Error).message }
      }
    }
  }
}
