/** Dimensions from the first bytes of a JPEG (SOFn segment) or PNG (IHDR). Enough to decide "ready inline". */
export function imageDimensions(bytes: Uint8Array): { width: number, height: number } | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xFF) return null
    const marker = bytes[i + 1]!
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: (bytes[i + 5]! << 8) | bytes[i + 6]!, width: (bytes[i + 7]! << 8) | bytes[i + 8]! }
    }
    i += 2 + length
  }
  return null
}

/** EXIF orientation 5–8 means the stored pixels are sideways, so the image must be re-encoded upright. */
export function jpegNeedsRotation(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes.slice(0, Math.min(bytes.length, 65_536)))
  const exif = text.indexOf('Exif\0\0')
  if (exif < 0) return false
  const tiff = exif + 6
  const little = text.toString('latin1', tiff, tiff + 2) === 'II'
  const read16 = (o: number) => little ? text.readUInt16LE(o) : text.readUInt16BE(o)
  const read32 = (o: number) => little ? text.readUInt32LE(o) : text.readUInt32BE(o)
  try {
    const ifd = tiff + read32(tiff + 4)
    const entries = read16(ifd)
    for (let n = 0; n < entries; n++) {
      const entry = ifd + 2 + n * 12
      if (read16(entry) === 0x0112) return read16(entry + 8) >= 5
    }
  } catch {
    return false
  }
  return false
}
