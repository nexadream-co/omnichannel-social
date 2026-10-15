import type { H3Event } from 'h3'

/** Where the accounts flow lands after a browser navigation, keeping the creator's locale prefix. */
export function accountsPath(event: H3Event, suffix = ''): string {
  const back = String(getCookie(event, 'socialz_oauth_return') ?? '')
  const base = back === '/en/app/accounts' ? '/en/app/accounts' : '/app/accounts'
  return `${base}${suffix}`
}

export function errorReason(error: unknown): string {
  const data = (error as { data?: { reason?: string, code?: string } })?.data
  return data?.reason ?? data?.code?.toLowerCase() ?? 'unknown'
}
