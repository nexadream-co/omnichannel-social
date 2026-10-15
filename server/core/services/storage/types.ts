export interface StorageDriver {
  readonly provider: string
  upload(input: { key: string, body: Uint8Array, contentType: string, cacheControl?: string }): Promise<{ key: string, url: string }>
  delete(key: string): Promise<void>
  presignPut(input: { key: string, contentType: string, contentLength: number, ttlSeconds: number }): Promise<string>
  presignGet(input: { key: string, ttlSeconds: number }): Promise<string>
  publicUrl(key: string): string
}
