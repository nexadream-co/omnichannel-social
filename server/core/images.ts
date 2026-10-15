import type { SmallImageType } from '../../shared/utils/uploads'

/** Type from magic bytes, never from the client (docs/blueprint/16 §1.2). SVG is never accepted. */
export function sniffImageType(bytes: Uint8Array): SmallImageType | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (b.length >= 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((v, i) => b[i] === v)) return 'image/png'
  if (b.length >= 6 && String.fromCharCode(...b.slice(0, 6)).match(/^GIF8[79]a$/)) return 'image/gif'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

/**
 * Removes JPEG APP1–APP15 segments (EXIF incl. GPS, XMP, maker notes) and comments; keeps APP0 (JFIF)
 * and everything needed to decode. Non-JPEG input is returned unchanged.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (sniffImageType(bytes) !== 'image/jpeg') return bytes
  const out: number[] = [0xFF, 0xD8]
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xFF) return bytes // malformed: keep the original rather than corrupt it
    const marker = bytes[i + 1]!
    if (marker === 0xDA) { // start of scan: the rest is image data
      for (let j = i; j < bytes.length; j++) out.push(bytes[j]!)
      return Uint8Array.from(out)
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
    const end = i + 2 + length
    if (end > bytes.length) return bytes
    const drop = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE
    if (!drop) for (let j = i; j < end; j++) out.push(bytes[j]!)
    i = end
  }
  return bytes
}
