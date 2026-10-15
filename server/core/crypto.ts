import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { env } from './env'

const PREFIX = 'enc:v1:'
let cachedKey: { secret: string, key: Buffer } | undefined

function key(): Buffer {
  const secret = env().SETTINGS_SECRET
  if (!secret) throw new Error('SETTINGS_SECRET is required to encrypt or decrypt secrets')
  if (cachedKey?.secret !== secret) cachedKey = { secret, key: scryptSync(secret, 'socialz.secrets.v1', 32) }
  return cachedKey.key
}

const b64 = (buf: Buffer) => buf.toString('base64url')

/** AES-256-GCM → 'enc:v1:<iv>:<tag>:<ciphertext>' (base64url). AAD binds the value to its row (social tokens). */
export function encrypt(plain: string, aad?: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  if (aad) cipher.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${PREFIX}${b64(iv)}:${b64(cipher.getAuthTag())}:${b64(ct)}`
}

/** Passes non-prefixed values through; returns '' when the value can't be decrypted (rotated key, wrong AAD). */
export function decrypt(value: string | null | undefined, aad?: string): string {
  if (!value) return ''
  if (!isEncrypted(value)) return value
  try {
    const [iv, tag, ct] = value.slice(PREFIX.length).split(':')
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv!, 'base64url'))
    if (aad) decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(Buffer.from(tag!, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ct!, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length < 12) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}
