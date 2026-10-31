import { describe, expect, it, vi } from 'vitest'
import { smtpConfigFrom } from '../../server/core/services/email'
import { smtpDriver } from '../../server/core/services/email/smtp'

const noEnv = { SMTP_HOST: '', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASSWORD: '' }
const message = { from: '"Socialz.id" <halo@socialz.id>', to: 'a@x.id', subject: 'Hai', html: '<p>Hai</p>', text: 'Hai', replyTo: 'cs@socialz.id' }

describe('smtpConfigFrom', () => {
  it('is null when neither the settings nor the env name a host', () => {
    expect(smtpConfigFrom({ 'email.smtpHost': '  ' }, noEnv)).toBeNull()
  })

  it('takes the whole block from the settings when their host is set', () => {
    const config = smtpConfigFrom(
      { 'email.smtpHost': 'smtp.gmail.com', 'email.smtpPort': '465', 'email.smtpUser': 'me@x.id', 'email.smtpPassword': 'app-pass' },
      { SMTP_HOST: 'env.host', SMTP_PORT: '587', SMTP_USER: 'env-user', SMTP_PASSWORD: 'env-pass' }
    )
    expect(config).toEqual({ host: 'smtp.gmail.com', port: 465, user: 'me@x.id', password: 'app-pass', secure: true })
  })

  it('falls back to the env, defaulting to port 587 with STARTTLS', () => {
    expect(smtpConfigFrom({ 'email.smtpHost': '', 'email.smtpUser': 'ignored' }, { SMTP_HOST: 'mail.x.id', SMTP_PORT: '', SMTP_USER: 'u', SMTP_PASSWORD: 'p' }))
      .toEqual({ host: 'mail.x.id', port: 587, user: 'u', password: 'p', secure: false })
  })
})

describe('smtpDriver', () => {
  it('sends through a fresh transport with auth and timeouts', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<id@x>' })
    const factory = vi.fn().mockReturnValue({ sendMail })
    const result = await smtpDriver({ host: 'h', port: 587, user: 'u', password: 'p', secure: false }, factory).send(message)
    expect(result).toEqual({ sent: true, id: '<id@x>' })
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ host: 'h', port: 587, secure: false, auth: { user: 'u', pass: 'p' }, connectionTimeout: 10_000 }))
    expect(sendMail).toHaveBeenCalledWith({ from: message.from, to: 'a@x.id', subject: 'Hai', html: '<p>Hai</p>', text: 'Hai', replyTo: 'cs@socialz.id' })
  })

  it('skips auth without a user (Mailpit) and returns failures instead of throwing', async () => {
    const factory = vi.fn().mockReturnValue({ sendMail: vi.fn().mockRejectedValue(Object.assign(new Error('Invalid login: 535'), { code: 'EAUTH' })) })
    const result = await smtpDriver({ host: 'localhost', port: 1025, user: '', password: '', secure: false }, factory).send(message)
    expect(result).toEqual({ sent: false, error: 'SMTP EAUTH: Invalid login: 535' })
    expect(factory.mock.calls[0]![0].auth).toBeUndefined()
  })

  it('names the inner reasons of a refused connection', async () => {
    const refused = Object.assign(new AggregateError([new Error('connect ECONNREFUSED ::1:1'), new Error('connect ECONNREFUSED 127.0.0.1:1')], ''), { code: 'ESOCKET' })
    const factory = vi.fn().mockReturnValue({ sendMail: vi.fn().mockRejectedValue(refused) })
    const result = await smtpDriver({ host: 'localhost', port: 1, user: '', password: '', secure: false }, factory).send(message)
    expect(result.error).toBe('SMTP ESOCKET: connect ECONNREFUSED ::1:1; connect ECONNREFUSED 127.0.0.1:1')
  })
})
