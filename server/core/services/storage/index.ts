import { env } from '../../env'
import { fakeStorageDriver } from './fake'
import { r2Driver } from './r2'
import type { StorageDriver } from './types'
import { vercelBlobDriver } from './vercel-blob'

export type { PresignedPut, StorageDriver } from './types'

const key = Symbol.for('socialz.storage')
type G = typeof globalThis & { [key]?: StorageDriver }

export function storage(): StorageDriver {
  const g = globalThis as G
  if (!g[key]) {
    const config = env()
    g[key] = config.STORAGE_DRIVER === 'fake'
      ? fakeStorageDriver()
      : config.STORAGE_DRIVER === 'vercel-blob'
        ? vercelBlobDriver({ token: config.BLOB_READ_WRITE_TOKEN, storeId: config.BLOB_STORE_ID })
        : r2Driver({
            accountId: config.R2_ACCOUNT_ID,
            accessKeyId: config.R2_ACCESS_KEY_ID,
            secretAccessKey: config.R2_SECRET_ACCESS_KEY,
            bucket: config.R2_BUCKET,
            endpoint: config.R2_ENDPOINT || undefined,
            publicBaseUrl: config.NUXT_PUBLIC_MEDIA_URL
          })
  }
  return g[key]!
}

/** Tests only. */
export function setStorageDriver(driver: StorageDriver | undefined) {
  (globalThis as G)[key] = driver
}
