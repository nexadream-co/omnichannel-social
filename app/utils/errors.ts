interface FetchErrorLike {
  statusCode?: number
  status?: number
  statusMessage?: string
  data?: { statusMessage?: string, message?: string, data?: { code?: string, field?: string } }
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED', 401: 'UNAUTHENTICATED', 402: 'PLAN_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  409: 'CONFLICT', 415: 'VALIDATION_FAILED', 422: 'VALIDATION_FAILED', 429: 'RATE_LIMITED'
}

export function extractStatusCode(caught: unknown): number {
  const error = caught as FetchErrorLike
  return error?.statusCode ?? error?.status ?? 500
}

/** The Bahasa statusMessage from the server, shown verbatim (docs/blueprint/12 §4). */
export function extractErrorMessage(caught: unknown, fallback: string): string {
  const error = caught as FetchErrorLike
  return error?.data?.statusMessage || error?.data?.message || error?.statusMessage || fallback
}

export function extractErrorCode(caught: unknown): string {
  const error = caught as FetchErrorLike
  return error?.data?.data?.code || DEFAULT_CODES[extractStatusCode(caught)] || 'SERVER_ERROR'
}

export function extractErrorField(caught: unknown): string | null {
  return (caught as FetchErrorLike)?.data?.data?.field ?? null
}
