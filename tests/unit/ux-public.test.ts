import { describe, expect, it } from 'vitest'
import { authErrorKey, passwordStrength } from '../../app/utils/auth-errors'

describe('authErrorKey', () => {
  it('maps the new cases', () => {
    expect(authErrorKey(undefined, 0)).toBe('authError.offline')
    expect(authErrorKey('INVALID_ORIGIN', 403)).toBe('authError.reload')
    expect(authErrorKey(undefined, 429)).toBe('authError.rateLimited')
    expect(authErrorKey('INVALID_EMAIL_OR_PASSWORD', 401)).toBe('authError.invalidCredentials')
    expect(authErrorKey('SOMETHING', 500)).toBe('authError.generic')
  })
})

describe('passwordStrength', () => {
  it('rates weak, fair and strong', () => {
    expect(passwordStrength('')).toBe(0)
    expect(passwordStrength('abc')).toBe(1)
    expect(passwordStrength('abcdefgh')).toBe(1)
    expect(passwordStrength('abcdefgh12')).toBe(2)
    expect(passwordStrength('Abcdefgh1234!')).toBe(3)
  })
})
