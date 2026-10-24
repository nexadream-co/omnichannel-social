const PATTERNS = { tick: 10, success: [12, 40, 12], warn: [20, 60, 20] } as const

/** A short vibration on phones that support it; silent elsewhere and when motion is unwelcome. */
export function haptic(kind: keyof typeof PATTERNS): void {
  if (!import.meta.client || !('vibrate' in navigator)) return
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(PATTERNS[kind] as number | number[])
  } catch {
    // ignore: haptics are decoration
  }
}
