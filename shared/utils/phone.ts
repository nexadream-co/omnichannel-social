/** Normalizes an Indonesian mobile number to 62xxxxxxxxxx, or returns null when it isn't one. */
export function normalizeIndonesianPhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  else if (digits.startsWith('8')) digits = `62${digits}`
  return /^628\d{7,11}$/.test(digits) ? digits : null
}

/** 6281234567890 → 0812-3456-7890: how people write their own number. */
export function formatIndonesianPhone(value: string | null | undefined): string {
  const normalized = normalizeIndonesianPhone(value)
  if (!normalized) return value ?? ''
  const local = `0${normalized.slice(2)}`
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3')
}

export function isValidIndonesianPhone(input: string | null | undefined): boolean {
  return normalizeIndonesianPhone(input) !== null
}
