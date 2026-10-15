import type { StorageDriver } from './types'

/** In-memory driver for tests (STORAGE_DRIVER=fake). */
export function fakeStorageDriver(objects = new Map<string, { body: Uint8Array, contentType: string }>()): StorageDriver & { objects: typeof objects } {
  return {
    provider: 'fake',
    objects,
    async upload({ key, body, contentType }) {
      objects.set(key, { body, contentType })
      return { key, url: `https://media.test/${key}` }
    },
    async delete(key) {
      objects.delete(key)
    },
    async presignPut({ key }) {
      return `https://media.test/${key}?signed=put`
    },
    async presignGet({ key }) {
      return `https://media.test/${key}?signed=get`
    },
    publicUrl: key => `https://media.test/${key}`
  }
}
