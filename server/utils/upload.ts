import type { H3Event } from 'h3'
import { appError } from '../core/errors'

/** The `file` field of a multipart body as bytes (docs/blueprint/12 §8). Bodies are ≤ 4 MB on every host. */
export async function readUploadedFile(event: H3Event): Promise<Uint8Array> {
  const parts = await readMultipartFormData(event).catch(() => undefined)
  const file = parts?.find(part => part.name === 'file')
  if (!file?.data?.length) throw appError(400, 'Pilih gambar terlebih dahulu.', 'VALIDATION_FAILED', { field: 'file' })
  return new Uint8Array(file.data)
}
