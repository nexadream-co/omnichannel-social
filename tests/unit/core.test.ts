import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, isEncrypted, maskSecret, safeEqual } from '../../server/core/crypto'
import { latestSlot } from '../../server/core/jobs/schedules'
import { signBody, verifySignature } from '../../server/core/jobs/signing'
import { backoffMs } from '../../server/core/jobs/queues'
import { zonedDateKey, zonedDayRange } from '../../server/core/timezone'
import { formatIDR, toAmount } from '../../server/core/money'
import { loadEnv } from '../../server/core/env'

describe('crypto', () => {
  it('round-trips and binds ciphertext to its AAD', () => {
    const value = encrypt('token-abc', 'acc1|instagram')
    expect(isEncrypted(value)).toBe(true)
    expect(decrypt(value, 'acc1|instagram')).toBe('token-abc')
    expect(decrypt(value, 'acc2|instagram')).toBe('')
    expect(decrypt('plain')).toBe('plain')
    expect(maskSecret('abcdefghijklmnop')).toBe('abcd••••mnop')
    expect(safeEqual('a', 'ab')).toBe(false)
  })
})

describe('signing', () => {
  it('accepts fresh signatures and rejects tampering or skew', () => {
    const now = new Date('2026-10-15T00:00:00Z')
    const header = signBody('s', '{"a":1}', now)
    expect(verifySignature('s', '{"a":1}', header, now)).toBe(true)
    expect(verifySignature('s', '{"a":2}', header, now)).toBe(false)
    expect(verifySignature('other', '{"a":1}', header, now)).toBe(false)
    expect(verifySignature('s', '{"a":1}', header, new Date(now.getTime() + 301_000))).toBe(false)
  })
})

describe('schedule slots', () => {
  it('uses local time (WIB) and includes the exact minute', () => {
    const at = new Date('2026-10-15T20:00:30Z') // 03:00:30 WIB on the 16th
    expect(latestSlot('0 3 * * *', 'Asia/Jakarta', at).toISOString()).toBe('2026-10-15T20:00:00.000Z')
    expect(latestSlot('0 3 * * *', 'Asia/Jakarta', new Date('2026-10-15T19:59:59Z')).toISOString()).toBe('2026-10-14T20:00:00.000Z')
    expect(latestSlot('0 3 * * *', 'Asia/Jakarta', new Date('2026-10-15T20:00:00Z')).toISOString()).toBe('2026-10-15T20:00:00.000Z')
  })
  it('backs off exponentially', () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(3))
  })
})

describe('time and money', () => {
  it('buckets local days', () => {
    expect(zonedDateKey(new Date('2026-10-15T17:30:00Z'), 'Asia/Jakarta')).toBe('2026-10-16')
    expect(zonedDayRange('2026-10-16', 'Asia/Jakarta').start.toISOString()).toBe('2026-10-15T17:00:00.000Z')
    expect(zonedDayRange('2026-10-16', 'Asia/Jayapura').start.toISOString()).toBe('2026-10-15T15:00:00.000Z')
  })
  it('never returns floats with noise', () => {
    expect(toAmount('49000.00')).toBe(49000)
    expect(toAmount(null)).toBe(0)
    expect(formatIDR(49000)).not.toMatch(/\u00A0/)
  })
})

describe('env', () => {
  it('refuses production without required secrets', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgres://x', NUXT_PUBLIC_APP_ENV: 'production' })).toThrow(/Missing required/)
    expect(loadEnv({ DATABASE_URL: 'postgres://x', NUXT_PUBLIC_SITE_URL: 'https://socialz.id/' }).siteUrl).toBe('https://socialz.id')
  })
})
