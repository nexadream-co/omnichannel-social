export interface OutgoingEmail {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export interface SendEmailResult {
  sent: boolean
  id?: string
  skipped?: 'not-configured' | 'template-inactive'
  error?: string
}

export interface EmailDriver {
  readonly name: string
  send(message: OutgoingEmail): Promise<SendEmailResult>
}
