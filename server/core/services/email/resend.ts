import type { EmailDriver, OutgoingEmail, SendEmailResult } from './types'

/** The only file that knows Resend exists (docs/blueprint/11 §4). Plain fetch, no SDK. */
export function resendDriver(apiKey: string, fetchImpl: typeof fetch = fetch): EmailDriver {
  return {
    name: 'resend',
    async send(message: OutgoingEmail): Promise<SendEmailResult> {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo
        }),
        signal: AbortSignal.timeout(10_000)
      })
      const body = await response.json().catch(() => ({})) as { id?: string, message?: string }
      if (!response.ok) return { sent: false, error: body.message || `Resend HTTP ${response.status}` }
      return { sent: true, id: body.id }
    }
  }
}
