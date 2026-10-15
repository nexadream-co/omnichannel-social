export const PASSWORD_MIN_LENGTH = 8

export const INDONESIAN_TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const
export type IndonesianTimezone = (typeof INDONESIAN_TIMEZONES)[number]

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Accepts a browser-detected zone; anything outside Indonesia falls back to WIB. */
export function toIndonesianTimezone(value: string | null | undefined): IndonesianTimezone {
  return (INDONESIAN_TIMEZONES as readonly string[]).includes(value ?? '') ? value as IndonesianTimezone : 'Asia/Jakarta'
}
