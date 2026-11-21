/**
 * "Tambah akun" from Buat Postingan: the composer remembers where to come back to (and which accounts it already
 * knew), Akun Sosial sends the creator back there once an account is connected. Per tab (sessionStorage), short-lived,
 * and every storage access is guarded: a private window or blocked storage simply skips the trip back.
 */
const KEY = 'socialz:compose-return'
const MAX_AGE_MS = 30 * 60_000

export interface ComposeReturn { path: string, knownAccountIds: string[], at: number }

export function rememberComposeReturn(path: string, knownAccountIds: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, knownAccountIds, at: Date.now() } satisfies ComposeReturn))
  } catch {
    // Storage unavailable: Akun Sosial just stays where it is.
  }
}

function read(): ComposeReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as ComposeReturn
    // Only paths inside the composer: never an open redirect.
    if (typeof value.path !== 'string' || !/^(\/en)?\/app\/compose(\?|$)/.test(value.path) || Date.now() - value.at > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY)
      return null
    }
    return { path: value.path, knownAccountIds: Array.isArray(value.knownAccountIds) ? value.knownAccountIds : [], at: value.at }
  } catch {
    return null
  }
}

export function peekComposeReturn(): ComposeReturn | null {
  return read()
}

export function takeComposeReturn(): ComposeReturn | null {
  const value = read()
  forgetComposeReturn()
  return value
}

export function forgetComposeReturn(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}

/** Accounts connected while the creator was away: selected for them on the way back. */
export function newAccountIds(activeIds: string[], knownIds: string[]): string[] {
  const known = new Set(knownIds)
  return activeIds.filter(id => !known.has(id))
}
