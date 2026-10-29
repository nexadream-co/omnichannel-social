/** A direct upload: PUT the body to `url` with its `content-type` plus these headers. */
export interface PresignedPut {
  url: string
  headers: Record<string, string>
}

export interface StorageDriver {
  readonly provider: string
  upload(input: { key: string, body: Uint8Array, contentType: string, cacheControl?: string }): Promise<{ key: string, url: string }>
  delete(key: string): Promise<void>
  presignPut(input: { key: string, contentType: string, contentLength: number, ttlSeconds: number }): Promise<PresignedPut>
  presignGet(input: { key: string, ttlSeconds: number }): Promise<string>
  publicUrl(key: string): string
}
