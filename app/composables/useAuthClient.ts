import { createAuthClient } from 'better-auth/vue'

export type Audience = 'creator' | 'staff'

export interface AuthClientOptions {
  audience: Audience
  basePath: string
  profileEndpoint: string
  loginRoute: string
  homeRoute: string
}

type AuthClient = ReturnType<typeof createAuthClient>
const clients = new Map<Audience, AuthClient>()

function betterAuthClient(options: AuthClientOptions): AuthClient {
  if (!clients.has(options.audience)) {
    const baseURL = import.meta.client ? window.location.origin : useRuntimeConfig().public.siteUrl
    clients.set(options.audience, createAuthClient({ baseURL, basePath: options.basePath }))
  }
  return clients.get(options.audience)!
}

export interface AuthResult { ok: boolean, code?: string, status?: number }

function toResult(error: { code?: string, status?: number } | null | undefined): AuthResult {
  return error ? { ok: false, code: error.code, status: error.status } : { ok: true }
}

/** One internal factory; useCreatorAuth / useStaffAuth are thin wrappers (docs/blueprint/13 §2). */
export function useAuthClient<Profile extends { user: { id: string } }>(options: AuthClientOptions) {
  const key = `auth:${options.audience}`
  const profile = useState<Profile | null>(`${key}:profile`, () => null)
  const ready = useState<boolean>(`${key}:ready`, () => false)
  const pending = useState<Promise<void> | null>(`${key}:pending`, () => null)

  const isAuthenticated = computed(() => Boolean(profile.value))

  function reset() {
    profile.value = null
    ready.value = true
  }

  async function fetchProfile(): Promise<void> {
    try {
      profile.value = await apiFetch<Profile>(options.profileEndpoint)
    } catch {
      profile.value = null
    } finally {
      ready.value = true
    }
  }

  async function init(): Promise<void> {
    if (ready.value) return
    pending.value ??= fetchProfile().finally(() => {
      pending.value = null
    })
    await pending.value
  }

  async function signIn(input: { email: string, password: string }): Promise<AuthResult> {
    const { error } = await betterAuthClient(options).signIn.email({ email: input.email.trim().toLowerCase(), password: input.password })
    if (!error) await fetchProfile()
    return toResult(error)
  }

  async function signOut(redirect = true): Promise<void> {
    await betterAuthClient(options).signOut().catch(() => undefined)
    reset()
    if (redirect) await navigateTo(options.loginRoute)
  }

  async function requestPasswordReset(email: string): Promise<AuthResult> {
    const redirectTo = `${window.location.origin}${options.loginRoute.replace(/login$/, 'reset-password')}`
    const { error } = await betterAuthClient(options).requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo })
    return toResult(error)
  }

  async function resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    const { error } = await betterAuthClient(options).resetPassword({ token, newPassword })
    return toResult(error)
  }

  return { options, profile, ready, isAuthenticated, init, fetchProfile, reset, signIn, signOut, requestPasswordReset, resetPassword, client: () => betterAuthClient(options) }
}
