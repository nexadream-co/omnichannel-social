/** better-auth / API error codes → i18n keys. Never show a raw library message to a creator. */
export function authErrorKey(code: string | undefined, status?: number): string {
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
