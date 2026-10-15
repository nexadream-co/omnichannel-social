import { createError } from 'h3'

export type ErrorCode
  = | 'VALIDATION_FAILED'
    | 'CHANNEL_VALIDATION_FAILED'
    | 'UNAUTHENTICATED'
    | 'EMAIL_NOT_VERIFIED'
    | 'PLAN_REQUIRED'
    | 'LIMIT_REACHED'
    | 'FORBIDDEN'
    | 'WORKSPACE_SUSPENDED'
    | 'WORKSPACE_DELETED'
    | 'ACCOUNT_REAUTH_REQUIRED'
    | 'PUBLISHING_PAUSED'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'SERVICE_UNAVAILABLE'
    | 'SERVER_ERROR'

/** createError({ statusCode, statusMessage: '<Bahasa sentence>', data: { code } }) — docs/blueprint/12 §4. */
export function appError(statusCode: number, statusMessage: string, code: ErrorCode, data: Record<string, unknown> = {}) {
  return createError({ statusCode, statusMessage, data: { code, ...data } })
}

export const GENERIC_ERROR_MESSAGE = 'Terjadi kesalahan. Coba lagi sebentar lagi.'
