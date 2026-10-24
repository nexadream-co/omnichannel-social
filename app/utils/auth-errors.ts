/** better-auth / API error codes → i18n keys. Never show a raw library message to a creator. */
export function authErrorKey(code: string | undefined, status?: number): string {
  // A dead connection has no status; better-fetch reports 0 (or nothing) for it.
  if (status === 0 || (!status && !code && typeof navigator !== 'undefined' && !navigator.onLine)) return 'authError.offline'
  if (status === 403 && (!code || ['FORBIDDEN', 'INVALID_ORIGIN', 'MISSING_OR_NULL_ORIGIN', 'INVALID_CALLBACK_URL'].includes(code))) return 'authError.reload'
  if (status === 429 || code === 'RATE_LIMITED' || code === 'TOO_MANY_REQUESTS') return 'authError.rateLimited'
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_PASSWORD':
    case 'INVALID_EMAIL':
    case 'USER_NOT_FOUND':
    case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
    case 'UNAUTHENTICATED':
      return 'authError.invalidCredentials'
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 'authError.invalidToken'
    case 'USER_ALREADY_EXISTS':
    case 'CONFLICT':
      return 'authError.emailTaken'
    default:
      return 'authError.generic'
  }
}

/** Only same-origin paths are honoured in ?redirect=. */
export function safeRedirect(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

/** Strength of a new password for the register meter: 1 weak, 2 fair, 3 strong. 0 while empty. */
export function passwordStrength(value: string): 0 | 1 | 2 | 3 {
  if (!value) return 0
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(value)).length
  if (value.length < 8) return 1
  if (value.length >= 12 && classes >= 3) return 3
  return classes >= 3 || value.length >= 10 ? 2 : 1
}
