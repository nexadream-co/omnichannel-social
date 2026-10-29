import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../../server/core/env'
import { vercelBlobDriver } from '../../server/core/services/storage/vercel-blob'

const token = 'vercel_blob_rw_AbC123_secretpart'

describe('vercelBlobDriver', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('serves keys from the public store host', () => {
    expect(vercelBlobDriver({ token }).publicUrl('m/ws/a b.jpg')).toBe('https://abc123.public.blob.vercel-storage.com/m/ws/a%20b.jpg')
    expect(vercelBlobDriver({ token, storeId: 'store_XyZ9' }).publicUrl('k')).toBe('https://xyz9.public.blob.vercel-storage.com/k')
  })

  it('rejects a missing or malformed token', () => {
    expect(() => vercelBlobDriver({ token: '' })).toThrow(/BLOB_READ_WRITE_TOKEN/)
    expect(() => vercelBlobDriver({ token: 'vercel_blob_client_x_y' })).toThrow(/BLOB_READ_WRITE_TOKEN/)
  })

  it('presigns a PUT with a client token scoped to the key, signed with the read-write token', async () => {
    const { url, headers } = await vercelBlobDriver({ token }).presignPut({ key: 'm/ws/1.mp4', contentType: 'video/mp4', contentLength: 1234, ttlSeconds: 60 })
    expect(url).toBe('https://vercel.com/api/blob/?pathname=m%2Fws%2F1.mp4')
    expect(headers['x-content-type']).toBe('video/mp4')
    expect(headers['x-vercel-blob-access']).toBe('public')
    const client = headers.authorization!.replace('Bearer vercel_blob_client_AbC123_', '')
    const [signature, payload] = Buffer.from(client, 'base64').toString().split('.')
    expect(signature).toBe(createHmac('sha256', token).update(payload!).digest('hex'))
    const scope = JSON.parse(Buffer.from(payload!, 'base64').toString())
    expect(scope).toMatchObject({ pathname: 'm/ws/1.mp4', allowedContentTypes: ['video/mp4'], maximumSizeInBytes: 1234, addRandomSuffix: false, allowOverwrite: true })
    expect(scope.validUntil).toBeGreaterThan(Date.now())
  })

  it('leaves the size open when the length is unknown (processor outputs)', async () => {
    const { headers } = await vercelBlobDriver({ token }).presignPut({ key: 'k.jpg', contentType: 'image/jpeg', contentLength: 0, ttlSeconds: 60 })
    const payload = Buffer.from(headers.authorization!.split('_').slice(4).join('_'), 'base64').toString().split('.')[1]!
    expect(JSON.parse(Buffer.from(payload, 'base64').toString())).not.toHaveProperty('maximumSizeInBytes')
  })

  it('uploads and deletes with the read-write token', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const driver = vercelBlobDriver({ token })
    expect(await driver.upload({ key: 'p/1.png', body: new Uint8Array([1]), contentType: 'image/png' })).toEqual({ key: 'p/1.png', url: 'https://abc123.public.blob.vercel-storage.com/p/1.png' })
    await driver.delete('p/1.png')
    const [put, del] = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(put[0]).toBe('https://vercel.com/api/blob/?pathname=p%2F1.png')
    expect(put[1].headers).toMatchObject({ 'authorization': `Bearer ${token}`, 'x-content-type': 'image/png', 'x-allow-overwrite': '1', 'x-add-random-suffix': '0' })
    expect(del[0]).toBe('https://vercel.com/api/blob/delete')
    expect(JSON.parse(String(del[1].body))).toEqual({ urls: ['https://abc123.public.blob.vercel-storage.com/p/1.png'] })
  })
})

describe('STORAGE_DRIVER', () => {
  const base = { DATABASE_URL: 'postgres://x' }
  it('picks Vercel Blob when its token is set, R2 otherwise, and an explicit value wins', () => {
    expect(loadEnv(base).STORAGE_DRIVER).toBe('r2')
    expect(loadEnv({ ...base, BLOB_READ_WRITE_TOKEN: token }).STORAGE_DRIVER).toBe('vercel-blob')
    expect(loadEnv({ ...base, BLOB_READ_WRITE_TOKEN: token, STORAGE_DRIVER: 'r2' }).STORAGE_DRIVER).toBe('r2')
  })
})
