/** Shared by browser and server; the server is the authority (docs/blueprint/16 §1.2). */
export const SMALL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type SmallImageType = (typeof SMALL_IMAGE_TYPES)[number]
export const SMALL_IMAGE_MAX_BYTES = 4 * 1024 * 1024
export const AVATAR_MAX_BYTES = 50 * 1024
export const AVATAR_MAX_PX = 512

export const IMAGE_EXTENSIONS: Record<SmallImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}
