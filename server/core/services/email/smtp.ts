import { createTransport } from 'nodemailer'
import type { EmailDriver, OutgoingEmail, SendEmailResult } from './types'

export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  /** Implicit TLS (port 465). False = plain connection upgraded with STARTTLS when the server offers it (587, 25, Mailpit 1025). */
  secure: boolean
}

type TransportFactory = (options: {
  host: string
  port: number
  secure: boolean
  auth?: { user: string, pass: string }
  connectionTimeout: number
  greetingTimeout: number
  socketTimeout: number
}) => { sendMail(message: Record<string, unknown>): Promise<{ messageId?: string }> }

/** A refused connection comes back as an AggregateError with an empty message; surface the inner reasons. */
function describeError(error: unknown): string {
  const err = error as Error & { code?: string, errors?: Error[] }
  const message = err.message || err.errors?.map(inner => inner.message).join('; ') || ''
  return `SMTP ${err.code ?? 'error'}: ${message || 'unknown error'}`
}

/**
 * The only file that knows nodemailer exists (docs/blueprint/11 §4). One connection per send: no pool,
 * because a serverless invocation may not outlive the response (docs/blueprint/19 §2).
 * Needs raw TCP, so it runs on Node hosts (Vercel, VPS, Cloud Run, Lambda) but not on Cloudflare Workers.
 */
export function smtpDriver(config: SmtpConfig, transportFactory: TransportFactory = createTransport): EmailDriver {
  return {
    name: 'smtp',
    async send(message: OutgoingEmail): Promise<SendEmailResult> {
      try {
        const transport = transportFactory({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.user ? { user: config.user, pass: config.password } : undefined,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 15_000
        })
        const info = await transport.sendMail({
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo
        })
        return { sent: true, id: info.messageId }
      } catch (error) {
        return { sent: false, error: describeError(error) }
      }
    }
  }
}
