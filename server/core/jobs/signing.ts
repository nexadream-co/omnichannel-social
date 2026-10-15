import { hmacSha256, safeEqual } from '../crypto'

export const SIGNATURE_HEADER = 'x-socialz-signature'
const MAX_SKEW_SECONDS = 300

/** `t=<unix seconds>,v1=<hex hmac of "t.body">` — used by fan-out and media callbacks. */
export function signBody(secret: string, body: string, now: Date = new Date()): string {
  const t = Math.floor(now.getTime() / 1000)
  return `t=${t},v1=${hmacSha256(secret, `${t}.${body}`)}`
}

export function verifySignature(secret: string, body: string, header: string | null | undefined, now: Date = new Date()): boolean {
  if (!secret || !header) return false
  const parts = Object.fromEntries(header.split(',').map(part => part.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || !parts.v1) return false
  if (Math.abs(now.getTime() / 1000 - t) > MAX_SKEW_SECONDS) return false
  return safeEqual(hmacSha256(secret, `${t}.${body}`), parts.v1)
}
