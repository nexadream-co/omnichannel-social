/** First letter of a title, uppercase; empty when there is nothing letter-like to show. */
export function initialOf(text: string | null | undefined): string {
  const match = (text ?? '').trim().match(/[\p{L}\p{N}]/u)
  return match ? match[0].toUpperCase() : ''
}

/** A merchant colour as a soft background (14% over transparent). */
export function tintOf(color: string): string {
  return `color-mix(in srgb, ${color} 14%, transparent)`
}
