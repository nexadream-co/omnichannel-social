import { createHmac } from 'node:crypto'
import type { StorageDriver } from './types'

export interface VercelBlobConfig {
  /** BLOB_READ_WRITE_TOKEN: `vercel_blob_rw_<storeId>_<secret>`. */
  token: string
  /** BLOB_STORE_ID (`store_<id>`); read from the token when empty. */
  storeId?: string
}

const API = 'https://vercel.com/api/blob'
const API_VERSION = '13'
const ONE_YEAR = 31_536_000

/**
 * The only file that knows Vercel Blob exists (its HTTP API over fetch, like the R2 driver). The store must be
 * public: Meta downloads published media by URL. Keys are uploaded as-is (no random suffix) and may be
 * overwritten, which matches S3 semantics, so a retried processor job can PUT the same key again.
 */
export function vercelBlobDriver(config: VercelBlobConfig): StorageDriver {
  const tokenStoreId = config.token.split('_')[3] ?? ''
  if (!config.token.startsWith('vercel_blob_rw_') || !tokenStoreId) throw new Error('BLOB_READ_WRITE_TOKEN is missing or malformed')
  const storeId = (config.storeId || tokenStoreId).replace(/^store_/, '').toLowerCase()
  const publicBase = `https://${storeId}.public.blob.vercel-storage.com`
  const publicUrl = (key: string) => `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`
  const apiHeaders = { 'x-api-version': API_VERSION, 'x-vercel-blob-access': 'public' }

  /** A client token scoped to one pathname, signed locally with the read-write token (no API call). */
  function clientToken(scope: { pathname: string, validUntil: number, allowedContentTypes: string[], maximumSizeInBytes?: number }) {
    const payload = Buffer.from(JSON.stringify({ ...scope, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: ONE_YEAR })).toString('base64')
    const signature = createHmac('sha256', config.token).update(payload).digest('hex')
    return `vercel_blob_client_${tokenStoreId}_${Buffer.from(`${signature}.${payload}`).toString('base64')}`
  }

  return {
    provider: 'vercel-blob',
    async upload({ key, body, contentType, cacheControl }) {
      const maxAge = Number(/max-age=(\d+)/.exec(cacheControl ?? '')?.[1] ?? ONE_YEAR)
      const response = await fetch(`${API}/?${new URLSearchParams({ pathname: key })}`, {
        method: 'PUT',
        body: new Uint8Array(body),
        headers: {
          ...apiHeaders,
          'authorization': `Bearer ${config.token}`,
          'x-content-type': contentType,
          'x-add-random-suffix': '0',
          'x-allow-overwrite': '1',
          'x-cache-control-max-age': String(maxAge)
        }
      })
      if (!response.ok) throw new Error(`Storage upload failed (${response.status})`)
      return { key, url: publicUrl(key) }
    },
    async delete(key) {
      const response = await fetch(`${API}/delete`, {
        method: 'POST',
        body: JSON.stringify({ urls: [publicUrl(key)] }),
        headers: { ...apiHeaders, 'authorization': `Bearer ${config.token}`, 'content-type': 'application/json' }
      })
      if (!response.ok && response.status !== 404) throw new Error(`Storage delete failed (${response.status})`)
    },
    async presignPut({ key, contentType, contentLength, ttlSeconds }) {
      const token = clientToken({
        pathname: key,
        validUntil: Date.now() + ttlSeconds * 1000,
        allowedContentTypes: [contentType],
        ...(contentLength > 0 ? { maximumSizeInBytes: contentLength } : {})
      })
      return {
        url: `${API}/?${new URLSearchParams({ pathname: key })}`,
        headers: { ...apiHeaders, 'authorization': `Bearer ${token}`, 'x-content-type': contentType }
      }
    },
    // A public store has no private objects and keys are unguessable, so the plain URL is enough.
    async presignGet({ key }) {
      return publicUrl(key)
    },
    publicUrl
  }
}
