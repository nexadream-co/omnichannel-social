/** Normalizes an Indonesian mobile number to 62xxxxxxxxxx, or returns null when it isn't one. */
export function normalizeIndonesianPhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  else if (digits.startsWith('8')) digits = `62${digits}`
  return /^628\d{7,11}$/.test(digits) ? digits : null
}

export function isValidIndonesianPhone(input: string | null | undefined): boolean {
  return normalizeIndonesianPhone(input) !== null
}
