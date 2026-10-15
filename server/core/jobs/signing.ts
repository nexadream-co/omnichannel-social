import { createHmac, timingSafeEqual } from 'node:crypto'

// Self-contained on purpose: the media processor container imports this file and has no app env.
export const SIGNATURE_HEADER = 'x-socialz-signature'
const MAX_SKEW_SECONDS = 300

const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex')

/** `t=<unix seconds>,v1=<hex hmac of "t.body">` — used by fan-out and the media processor. */
export function signBody(secret: string, body: string, now: Date = new Date()): string {
  const t = Math.floor(now.getTime() / 1000)
  return `t=${t},v1=${hmac(secret, `${t}.${body}`)}`
}

export function verifySignature(secret: string, body: string, header: string | null | undefined, now: Date = new Date()): boolean {
  if (!secret || !header) return false
  const parts = Object.fromEntries(header.split(',').map(part => part.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || !parts.v1) return false
  if (Math.abs(now.getTime() / 1000 - t) > MAX_SKEW_SECONDS) return false
  const expected = Buffer.from(hmac(secret, `${t}.${body}`))
  const actual = Buffer.from(parts.v1)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
