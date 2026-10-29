import { AwsClient } from 'aws4fetch'
import type { StorageDriver } from './types'

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string
  /** Overrides the R2 endpoint (dev: MinIO). */
  endpoint?: string
}

/** The only file that knows Cloudflare R2 exists (S3 API signed with aws4fetch). docs/blueprint/16 §1 */
export function r2Driver(config: R2Config): StorageDriver {
  const client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: 's3', region: 'auto' })
  const endpoint = (config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, '')
  const objectUrl = (key: string) => `${endpoint}/${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  const publicBase = config.publicBaseUrl.replace(/\/+$/, '')

  return {
    provider: 'r2',
    async upload({ key, body, contentType, cacheControl }) {
      const response = await client.fetch(objectUrl(key), {
        method: 'PUT',
        body: new Uint8Array(body),
        headers: { 'content-type': contentType, 'cache-control': cacheControl ?? 'public, max-age=31536000, immutable' }
      })
      if (!response.ok) throw new Error(`Storage upload failed (${response.status})`)
      return { key, url: `${publicBase}/${key}` }
    },
    async delete(key) {
      const response = await client.fetch(objectUrl(key), { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw new Error(`Storage delete failed (${response.status})`)
    },
    async presignPut({ key, contentType, ttlSeconds }) {
      const url = new URL(objectUrl(key))
      url.searchParams.set('X-Amz-Expires', String(ttlSeconds))
      const signed = await client.sign(new Request(url, { method: 'PUT', headers: { 'content-type': contentType } }), { aws: { signQuery: true } })
      return { url: signed.url, headers: {} }
    },
    async presignGet({ key, ttlSeconds }) {
      const url = new URL(objectUrl(key))
      url.searchParams.set('X-Amz-Expires', String(ttlSeconds))
      return (await client.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } })).url
    },
    publicUrl: key => `${publicBase}/${key}`
  }
}
