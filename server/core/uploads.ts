import { randomBytes } from 'node:crypto'
import { IMAGE_EXTENSIONS, SMALL_IMAGE_MAX_BYTES } from '../../shared/utils/uploads'
import { appError } from './errors'
import { sniffImageType, stripJpegMetadata } from './images'
import { storage } from './services/storage'

/**
 * Small images (avatars, product images, CMS) through the server (docs/blueprint/16 §1.2).
 * The type is sniffed from bytes, the name is generated, EXIF is stripped. The client filename never reaches the key.
 */
export async function handleUpload(prefix: string, data: Uint8Array, options: { maxBytes?: number } = {}) {
  const maxBytes = Math.min(options.maxBytes ?? SMALL_IMAGE_MAX_BYTES, SMALL_IMAGE_MAX_BYTES)
  if (!data.length) throw appError(400, 'Pilih gambar terlebih dahulu.', 'VALIDATION_FAILED', { field: 'file' })
  if (data.length > maxBytes) {
    throw appError(400, `Ukuran gambar maksimal ${Math.round(maxBytes / 1024)} KB.`, 'VALIDATION_FAILED', { field: 'file' })
  }
  const contentType = sniffImageType(data)
  if (!contentType) throw appError(400, 'Format gambar harus JPG, PNG, WebP atau GIF.', 'VALIDATION_FAILED', { field: 'file' })
  const body = contentType === 'image/jpeg' ? stripJpegMetadata(data) : data
  const key = `${prefix.replace(/\/?$/, '/')}${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSIONS[contentType]}`
  const { url } = await storage().upload({ key, body, contentType })
  return { key, url, size: body.length, contentType }
}
