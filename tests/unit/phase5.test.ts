import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sniffImageType, stripJpegMetadata } from '../../server/core/images'
import { parseSignedRequest } from '../../server/core/meta-callbacks'

function jpegWithExif(): Uint8Array {
  const app0 = [0xFF, 0xE0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const exif = [0xFF, 0xE1, 0x00, 0x0A, ...Buffer.from('Exif\0\0GPS').subarray(0, 8)]
  const sos = [0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9]
  return Uint8Array.from([0xFF, 0xD8, ...app0, ...exif, ...sos])
}

describe('image sniffing', () => {
  it('detects by magic bytes and rejects SVG/HTML', () => {
    expect(sniffImageType(jpegWithExif())).toBe('image/jpeg')
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0]))).toBe('image/png')
    expect(sniffImageType(new TextEncoder().encode('GIF89a....'))).toBe('image/gif')
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull()
  })
  it('strips EXIF (APP1) but keeps JFIF and the scan data', () => {
    const input = jpegWithExif()
    const output = stripJpegMetadata(input)
    const text = Buffer.from(output).toString('latin1')
    expect(text).toContain('JFIF')
    expect(text).not.toContain('Exif')
    expect(output.length).toBe(input.length - 12)
    expect([...output.slice(-2)]).toEqual([0xFF, 0xD9])
  })
})

describe('Meta signed_request', () => {
  const sign = (payload: object, secret: string) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${createHmac('sha256', secret).update(body).digest('base64url')}.${body}`
  }
  it('identifies the platform by which app secret verifies', () => {
    const request = sign({ algorithm: 'HMAC-SHA256', user_id: '1789' }, 'ig-secret')
    expect(parseSignedRequest(request, { facebook: 'fb-secret', instagram: 'ig-secret' })).toEqual({ platform: 'instagram', userId: '1789' })
  })
  it('rejects a wrong secret, a tampered payload, and a non-HMAC algorithm', () => {
    const request = sign({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'other')
    expect(parseSignedRequest(request, { facebook: 'fb-secret' })).toBeNull()
    const [sig] = sign({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'fb-secret').split('.')
    expect(parseSignedRequest(`${sig}.${Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '2' })).toString('base64url')}`, { facebook: 'fb-secret' })).toBeNull()
    expect(parseSignedRequest(sign({ algorithm: 'none', user_id: '1' }, 'fb-secret'), { facebook: 'fb-secret' })).toBeNull()
  })
})
